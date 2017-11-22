'use strict';

const path = require('path');
const fs = require('fs');
const RSVP = require('rsvp');
const tmp = require('tmp');
const underscoreString = require('underscore.string');
const WatchedDir = require('broccoli-source').WatchedDir;
const broccoliNodeInfo = require('broccoli-node-info');

const NodeWrapper = require('./wrappers/node');
const TransformNodeWrapper = require('./wrappers/transform-node');
const SourceNodeWrapper = require('./wrappers/source-node');

const BuilderError = require('./errors/builder');
const NodeSetupError = require('./errors/node-setup');
const BuildError = require('./errors/build');

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup();

// For an explanation and reference of the API that we use to communicate with
// nodes (__broccoliFeatures__ and __broccoliGetInfo__), see
// https://github.com/broccolijs/broccoli/blob/master/docs/node-api.md

// Build a graph of nodes, referenced by its final output node. Example:
//
// const builder = new Builder(outputNode)
// builder.build()
//   .then(() => {
//     // Build output has been written to builder.outputPath
//   })
//   // To rebuild, call builder.build() repeatedly
//   .finally(() => {
//     // Delete temporary directories
//     return builder.cleanup()
//   })
//
// Note that the API of this Builder may change between minor Broccoli
// versions. Backwards compatibility is only guaranteed for plugins, so any
// plugin that works with Broccoli 1.0 will work with 1.x.

module.exports = class Builder {
  constructor(outputNode, options) {
    if (options == null) options = {};

    this.outputNode = outputNode;
    this.tmpdir = options.tmpdir; // can be null

    this.unwatchedPaths = [];
    this.watchedPaths = [];

    // nodeWrappers store additional bookkeeping information, such as paths.
    // This array contains them in topological (build) order.
    this.nodeWrappers = [];
    // This populates this.nodeWrappers as a side effect
    this.outputNodeWrapper = this.makeNodeWrapper(this.outputNode);

    // Catching missing directories here helps prevent later errors when we set
    // up the watcher.
    this.checkInputPathsExist();

    this.setupTmpDirs();

    // Now that temporary directories are set up, we need to run the rest of the
    // constructor in a try/catch block to clean them up if necessary.
    try {
      this.setupNodes();
      this.outputPath = this.outputNodeWrapper.outputPath;
      this.buildId = 0;
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }

  // Trigger a (re)build.
  //
  // Returns a promise that resolves when the build has finished. If there is a
  // build error, the promise is rejected with a Builder.BuildError instance.
  // This method will never throw, and it will never be rejected with anything
  // other than a BuildError.
  build() {
    this.buildId++;
    let promise = RSVP.resolve();
    this.nodeWrappers.forEach(nw => {
      // We use `.forEach` instead of `for` to close nested functions over `nw`

      // Wipe all buildState objects at the beginning of the build
      nw.buildState = {};

      promise = promise.then(() => {
        // We use a nested .then/.catch so that the .catch can only catch errors
        // from this node, but not from previous nodes.
        return RSVP.resolve()
          .then(() => this.trigger('beginNode', nw))
          .then(() => nw.build())
          .finally(() => this.trigger('endNode', nw))
          .catch(err => {
            throw new BuildError(err, nw);
          });
      });
    });

    return promise;
  }

  // Destructor-like method. Cleanup is synchronous at the moment, but in the
  // future we might change it to return a promise.
  cleanup() {
    this.builderTmpDirCleanup();
  }

  // This method recursively traverses the node graph and returns a nodeWrapper.
  // The nodeWrapper graph parallels the node graph 1:1.
  makeNodeWrapper(node, _stack) {
    if (_stack == null) _stack = [];

    // Dedupe nodes reachable through multiple paths
    for (let i = 0; i < this.nodeWrappers.length; i++) {
      if (this.nodeWrappers[i].originalNode === node) {
        return this.nodeWrappers[i];
      }
    }

    // Turn string nodes into WatchedDir nodes
    const originalNode = node; // keep original (possibly string) node around for deduping
    if (typeof node === 'string') {
      node = new WatchedDir(node, { annotation: 'string node' });
    }

    // Call node.__broccoliGetInfo__()
    let nodeInfo;
    try {
      nodeInfo = broccoliNodeInfo.getNodeInfo(node);
    } catch (e) {
      if (!(e instanceof broccoliNodeInfo.InvalidNodeError)) throw e;
      // We don't have the instantiation stack of an invalid node, so to aid
      // debugging, we instead report its parent node
      const messageSuffix =
        _stack.length > 0
          ? '\nused as input node to ' +
            _stack[_stack.length - 1].label +
            _stack[_stack.length - 1].formatInstantiationStackForTerminal()
          : '\nused as output node';
      throw new broccoliNodeInfo.InvalidNodeError(e.message + messageSuffix);
    }

    // Compute label, like "Funnel (test suite)"
    let label = nodeInfo.name;
    const labelExtras = [];
    if (nodeInfo.nodeType === 'source') labelExtras.push(nodeInfo.sourceDirectory);
    if (nodeInfo.annotation != null) labelExtras.push(nodeInfo.annotation);
    if (labelExtras.length > 0) label += ' (' + labelExtras.join('; ') + ')';

    // We start constructing the nodeWrapper here because we'll need the partial
    // nodeWrapper for the _stack. Later we'll add more properties.
    const nodeWrapper =
      nodeInfo.nodeType === 'transform' ? new TransformNodeWrapper() : new SourceNodeWrapper();
    nodeWrapper.nodeInfo = nodeInfo;
    nodeWrapper.originalNode = originalNode;
    nodeWrapper.node = node;
    nodeWrapper.label = label;

    // Detect cycles
    for (let i = 0; i < _stack.length; i++) {
      if (_stack[i].node === originalNode) {
        let cycleMessage = 'Cycle in node graph: ';
        for (let j = i; j < _stack.length; j++) {
          cycleMessage += _stack[j].label + ' -> ';
        }
        cycleMessage += nodeWrapper.label;
        throw new this.constructor.BuilderError(cycleMessage);
      }
    }

    // For 'transform' nodes, recurse into the input nodes; for 'source' nodes,
    // record paths.
    let inputNodeWrappers = [];
    if (nodeInfo.nodeType === 'transform') {
      const newStack = _stack.concat([nodeWrapper]);
      inputNodeWrappers = nodeInfo.inputNodes.map(inputNode => {
        return this.makeNodeWrapper(inputNode, newStack);
      });
    } else {
      // nodeType === 'source'
      if (nodeInfo.watched) {
        this.watchedPaths.push(nodeInfo.sourceDirectory);
      } else {
        this.unwatchedPaths.push(nodeInfo.sourceDirectory);
      }
    }

    // For convenience, all nodeWrappers get an `inputNodeWrappers` array; for
    // 'source' nodes it's empty.
    nodeWrapper.inputNodeWrappers = inputNodeWrappers;

    nodeWrapper.id = this.nodeWrappers.length;

    // this.nodeWrappers will contain all the node wrappers in topological
    // order, i.e. each node comes after all its input nodes.
    //
    // It's unfortunate that we're mutating this.nodeWrappers as a side effect,
    // but since we work backwards from the output node to discover all the
    // input nodes, it's harder to do a side-effect-free topological sort.
    this.nodeWrappers.push(nodeWrapper);

    return nodeWrapper;
  }

  checkInputPathsExist() {
    // We might consider checking this.unwatchedPaths as well.
    for (let i = 0; i < this.watchedPaths.length; i++) {
      let isDirectory;
      try {
        isDirectory = fs.statSync(this.watchedPaths[i]).isDirectory();
      } catch (err) {
        throw new this.constructor.BuilderError('Directory not found: ' + this.watchedPaths[i]);
      }
      if (!isDirectory) {
        throw new this.constructor.BuilderError('Not a directory: ' + this.watchedPaths[i]);
      }
    }
  }

  setupTmpDirs() {
    // Create temporary directories for each node:
    //
    //   out-01-someplugin/
    //   out-02-otherplugin/
    //   cache-01-someplugin/
    //   cache-02-otherplugin/
    //
    // Here's an alternative directory structure we might consider (it's not
    // clear which structure makes debugging easier):
    //
    //   01-someplugin/
    //     out/
    //     cache/
    //     in-1 -> ... // symlink for convenience
    //     in-2 -> ...
    //   02-otherplugin/
    //     ...
    const tmpobj = tmp.dirSync({
      prefix: 'broccoli-',
      unsafeCleanup: true,
      dir: this.tmpdir,
    });

    this.builderTmpDir = tmpobj.name;
    this.builderTmpDirCleanup = tmpobj.removeCallback;

    for (let i = 0; i < this.nodeWrappers.length; i++) {
      const nodeWrapper = this.nodeWrappers[i];
      if (nodeWrapper.nodeInfo.nodeType === 'transform') {
        nodeWrapper.inputPaths = nodeWrapper.inputNodeWrappers.map(function(nw) {
          return nw.outputPath;
        });
        nodeWrapper.outputPath = this.mkTmpDir(nodeWrapper, 'out');

        if (nodeWrapper.nodeInfo.needsCache) {
          nodeWrapper.cachePath = this.mkTmpDir(nodeWrapper, 'cache');
        }
      } else {
        // nodeType === 'source'
        // We could name this .sourcePath, but with .outputPath the code is simpler.
        nodeWrapper.outputPath = nodeWrapper.nodeInfo.sourceDirectory;
      }
    }
  }

  // Create temporary directory, like
  // /tmp/broccoli-9rLfJh/out-067-merge_trees_vendor_packages
  // type is 'out' or 'cache'
  mkTmpDir(nodeWrapper, type) {
    let nameAndAnnotation =
      nodeWrapper.nodeInfo.name + ' ' + (nodeWrapper.nodeInfo.annotation || '');
    // slugify turns fooBar into foobar, so we call underscored first to
    // preserve word boundaries
    let suffix = underscoreString.underscored(nameAndAnnotation.substr(0, 60));
    suffix = underscoreString.slugify(suffix).replace(/-/g, '_');
    // 1 .. 147 -> '001' .. '147'
    const paddedId = underscoreString.pad(
      '' + nodeWrapper.id,
      ('' + this.nodeWrappers.length).length,
      '0'
    );
    const dirname = type + '-' + paddedId + '-' + suffix;
    const tmpDir = path.join(this.builderTmpDir, dirname);
    fs.mkdirSync(tmpDir);
    return tmpDir;
  }

  setupNodes() {
    for (let i = 0; i < this.nodeWrappers.length; i++) {
      const nw = this.nodeWrappers[i];
      try {
        nw.setup(this.features);
      } catch (err) {
        throw new NodeSetupError(err, nw);
      }
    }
  }

  get features() {
    return broccoliNodeInfo.features;
  }
};

RSVP.EventTarget.mixin(module.exports.prototype);

module.exports.BuilderError = BuilderError;
module.exports.InvalidNodeError = broccoliNodeInfo.InvalidNodeError;
module.exports.NodeSetupError = NodeSetupError;
module.exports.BuildError = BuildError;
module.exports.NodeWrapper = NodeWrapper;
module.exports.TransformNodeWrapper = TransformNodeWrapper;
module.exports.SourceNodeWrapper = SourceNodeWrapper;
