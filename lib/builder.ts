import fs from 'fs';
import tmp from 'tmp';
import path from 'path';
import { WatchedDir } from 'broccoli-source';
import TransformNodeWrapper from './wrappers/transform-node';
import SourceNodeWrapper from './wrappers/source-node';
import BuilderError from './errors/builder';
import NodeSetupError from './errors/node-setup';
import BuildError from './errors/build';
import CancelationRequest from './cancelation-request';
import filterMap from './utils/filter-map';
import { EventEmitter } from 'events';
import { TransformNode, SourceNode, Node } from 'broccoli-node-api';
import NodeWrapper from './wrappers/node';

const heimdall = require('heimdalljs');
const underscoreString = require('underscore.string');
const broccoliNodeInfo = require('broccoli-node-info');
const logger = require('heimdalljs-logger')('broccoli:builder');

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup();

interface BuilderOptions {
  tmpdir?: string | null;
}

type NodeWrappers = TransformNodeWrapper | SourceNodeWrapper;

// For an explanation and reference of the API that we use to communicate with
// nodes (__broccoliFeatures__ and __broccoliGetInfo__), see
// https://github.com/broccolijs/broccoli/blob/master/docs/node-api.md

// Build a graph of nodes, referenced by its final output node. Example:
//
// ```js
// const builder = new Builder(outputNode)
// try {
//   const { outputPath } = await builder.build()
// } finally {
//   await builder.cleanup()
// }
// ```
//
// Note that the API of this Builder may change between minor Broccoli
// versions. Backwards compatibility is only guaranteed for plugins, so any
// plugin that works with Broccoli 1.0 will work with 1.x.

class Builder extends EventEmitter {
  outputNode: Node;
  tmpdir?: string | null;
  unwatchedPaths: string[];
  watchedPaths: string[];
  _nodeWrappers: Map<TransformNode | SourceNode, NodeWrappers>;
  outputNodeWrapper: NodeWrappers;
  _cancelationRequest: any;
  outputPath: string;
  buildId: number;
  builderTmpDir!: string;
  builderTmpDirCleanup!: any;

  static get BuilderError() {
    return BuilderError;
  }
  static get InvalidNodeError() {
    return broccoliNodeInfo.InvalidNodeError;
  }
  static get NodeSetupError() {
    return NodeSetupError;
  }
  static get BuildError() {
    return BuildError;
  }
  static get NodeWrapper() {
    return NodeWrapper;
  }
  static get TransformNodeWrapper() {
    return TransformNodeWrapper;
  }
  static get SourceNodeWrapper() {
    return SourceNodeWrapper;
  }

  constructor(outputNode: Node, options: BuilderOptions = {}) {
    super();

    this.outputNode = outputNode;
    this.tmpdir = options.tmpdir; // can be null

    this.unwatchedPaths = [];
    this.watchedPaths = [];

    // nodeWrappers store additional bookkeeping information, such as paths.
    // This array contains them in topological (build) order.
    this._nodeWrappers = new Map();

    // This populates this._nodeWrappers as a side effect
    this.outputNodeWrapper = this.makeNodeWrapper(this.outputNode);

    // Catching missing directories here helps prevent later errors when we set
    // up the watcher.
    this.checkInputPathsExist();

    this.setupTmpDirs();
    this.setupHeimdall();
    this._cancelationRequest = undefined;

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
  async build() {
    if (this._cancelationRequest) {
      throw new BuilderError('Cannot start a build if one is already running');
    }

    let pipeline = Promise.resolve();

    this.buildId++;

    for (const nw of this._nodeWrappers.values()) {
      // Wipe all buildState objects at the beginning of the build
      nw.buildState = {};

      // the build is two passes, first we create a promise chain representing
      // the complete build, then we pass that terminal promises which
      // represents the build to the CancelationRequest, after which the build
      // itself begins.
      //
      // 1. build up a promise chain, which represents the complete build
      pipeline = pipeline.then(async () => {
        // 3. begin next build step
        this._cancelationRequest.throwIfRequested();
        this.emit('beginNode', nw);
        try {
          await nw.build();
          this.emit('endNode', nw);
        } catch (e) {
          this.emit('endNode', nw);
          // wrap the error which occurred from a node wrappers build with
          // additional build information. This includes which build step
          // caused the error, and where that build step was instantiated.
          throw new BuildError(e, nw);
        }
      });
    }

    // 2. Create CancelationRequest which waits on the complete build itself
    // This allows us to initiate a cancellation, but wait until any
    // un-cancelable work completes before canceling. This allows us to safely
    // wait until cancelation is complete before performance actions such as
    // cleanup, or restarting the build itself.
    this._cancelationRequest = new CancelationRequest(pipeline);

    try {
      await pipeline;
      this.buildHeimdallTree(this.outputNodeWrapper);
    } finally {
      let buildsSkipped = filterMap(
        this._nodeWrappers.values(),
        (nw: NodeWrappers) => nw.buildState.built === false
      ).length;
      logger.debug(`Total nodes skipped: ${buildsSkipped} out of ${this._nodeWrappers.size}`);

      this._cancelationRequest = null;
    }
  }

  async cancel() {
    if (this._cancelationRequest) {
      return this._cancelationRequest.cancel();
    }
  }

  // Destructor-like method. Waits on current node to finish building, then cleans up temp directories
  async cleanup() {
    try {
      await this.cancel();
    } finally {
      await this.builderTmpDirCleanup();
    }
  }

  // This method recursively traverses the node graph and returns a nodeWrapper.
  // The nodeWrapper graph parallels the node graph 1:1.
  makeNodeWrapper(node: Node, _stack: any = []) {
    let wrapper = this._nodeWrappers.get(node);
    if (wrapper !== undefined) {
      return wrapper;
    }

    // Turn string nodes into WatchedDir nodes
    const originalNode = node; // keep original (possibly string) node around so we can later deduplicate
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
    const nodeWrapper: any =
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
        throw new BuilderError(cycleMessage);
      }
    }

    // For 'transform' nodes, recursively enter into the input nodes; for
    // 'source' nodes, record paths.
    let inputNodeWrappers = [];
    if (nodeInfo.nodeType === 'transform') {
      const newStack = _stack.concat([nodeWrapper]);
      inputNodeWrappers = nodeInfo.inputNodes.map((inputNode: Node) => {
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

    nodeWrapper.id = this._nodeWrappers.size;

    // this._nodeWrappers will contain all the node wrappers in topological
    // order, i.e. each node comes after all its input nodes.
    //
    // It's unfortunate that we're mutating this._nodeWrappers as a side effect,
    // but since we work backwards from the output node to discover all the
    // input nodes, it's harder to do a side-effect-free topological sort.
    this._nodeWrappers.set(nodeWrapper.originalNode, nodeWrapper);

    return nodeWrapper;
  }

  get watchedSourceNodeWrappers() {
    return filterMap(this._nodeWrappers.values(), (nw: NodeWrappers) => {
      return nw.nodeInfo.nodeType === 'source' && nw.nodeInfo.watched;
    });
  }

  checkInputPathsExist() {
    // We might consider checking this.unwatchedPaths as well.
    for (let i = 0; i < this.watchedPaths.length; i++) {
      let isDirectory;
      try {
        isDirectory = fs.statSync(this.watchedPaths[i]).isDirectory();
      } catch (err) {
        throw new BuilderError('Directory not found: ' + this.watchedPaths[i]);
      }
      if (!isDirectory) {
        throw new BuilderError('Not a directory: ' + this.watchedPaths[i]);
      }
    }
  }

  setupTmpDirs() {
    // Create temporary directories for each node:
    //
    //   out-01-some-plugin/
    //   out-02-otherplugin/
    //   cache-01-some-plugin/
    //   cache-02-otherplugin/
    //
    // Here's an alternative directory structure we might consider (it's not
    // clear which structure makes debugging easier):
    //
    //   01-some-plugin/
    //     out/
    //     cache/
    //     in-1 -> ... // symlink for convenience
    //     in-2 -> ...
    //   02-otherplugin/
    //     ...
    // @ts-ignore
    const tmpObj = tmp.dirSync({
      prefix: 'broccoli-',
      unsafeCleanup: true,
      dir: this.tmpdir || undefined,
    });

    this.builderTmpDir = tmpObj.name;
    this.builderTmpDirCleanup = tmpObj.removeCallback;

    for (let nodeWrapper of this._nodeWrappers.values()) {
      if (nodeWrapper.nodeInfo.nodeType === 'transform') {
        (nodeWrapper as TransformNodeWrapper).inputPaths = nodeWrapper.inputNodeWrappers.map((nw: any) => nw.outputPath);
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
  mkTmpDir(nodeWrapper: NodeWrappers, type: 'out' | 'cache') {
    let nameAndAnnotation =
      nodeWrapper.nodeInfo.name + ' ' + (nodeWrapper.nodeInfo.annotation || '');
    // slugify turns fooBar into foobar, so we call underscored first to
    // preserve word boundaries
    let suffix = underscoreString.underscored(nameAndAnnotation.substr(0, 60));
    suffix = underscoreString.slugify(suffix).replace(/-/g, '_');
    // 1 .. 147 -> '001' .. '147'
    const paddedId = underscoreString.pad(
      '' + nodeWrapper.id,
      ('' + this._nodeWrappers.size).length,
      '0'
    );
    const dirname = type + '-' + paddedId + '-' + suffix;
    const tmpDir = path.join(this.builderTmpDir, dirname);
    fs.mkdirSync(tmpDir);
    return tmpDir;
  }

  // for compat
  get nodeWrappers() {
    return [...this._nodeWrappers.values()];
  }

  setupNodes() {
    for (let nw of this._nodeWrappers.values()) {
      try {
        nw.setup(this.features);
      } catch (err) {
        throw new NodeSetupError(err, nw);
      }
    }
  }

  setupHeimdall() {
    this.on('beginNode', node => {
      let name;

      if (node instanceof SourceNodeWrapper) {
        name = node.nodeInfo.sourceDirectory;
      } else {
        name = node.nodeInfo.annotation || node.nodeInfo.name;
      }

      node.__heimdall_cookie__ = heimdall.start({
        name,
        label: node.label,
        broccoliNode: true,
        broccoliId: node.id,
        // we should do this instead of reParentNodes
        // broccoliInputIds: node.inputNodeWrappers.map(input => input.id),
        broccoliCachedNode: false,
        broccoliPluginName: node.nodeInfo.name,
      });
      node.__heimdall__ = heimdall.current;
    });

    this.on('endNode', node => {
      if (node.__heimdall__) {
        node.__heimdall_cookie__.stop();
      }
    });
  }

  buildHeimdallTree(outputNodeWrapper: any) {
    if (!outputNodeWrapper.__heimdall__) {
      return;
    }

    // Why?
    reParentNodes(outputNodeWrapper);

    // What uses this??
    aggregateTime();
  }

  get features() {
    return broccoliNodeInfo.features;
  }
}

function reParentNodes(outputNodeWrapper: any) {
  // re-parent heimdall nodes according to input nodes
  const seen = new Set();
  const queue = [outputNodeWrapper];
  let node;
  let parent;
  let stack: any = [];
  while ((node = queue.pop()) !== undefined) {
    if (parent === node) {
      parent = stack.pop();
    } else {
      queue.push(node);

      let heimdallNode = node.__heimdall__;
      if (heimdallNode === undefined || seen.has(heimdallNode)) {
        // make 0 time node
        const cookie = heimdall.start(Object.assign({}, heimdallNode.id));
        heimdallNode = heimdall.current;
        heimdallNode.id.broccoliCachedNode = true;
        cookie.stop();
        heimdallNode.stats.time.self = 0;
      } else {
        seen.add(heimdallNode);
        // Only push children for non "cached inputs"
        const inputNodeWrappers = node.inputNodeWrappers;
        for (let i = inputNodeWrappers.length - 1; i >= 0; i--) {
          queue.push(inputNodeWrappers[i]);
        }
      }

      if (parent) {
        heimdallNode.remove();
        parent.__heimdall__.addChild(heimdallNode);
        stack.push(parent);
      }
      parent = node;
    }
  }
}

function aggregateTime() {
  let queue = [heimdall.current];
  let stack: any = [];
  let parent;
  let node;
  while ((node = queue.pop()) !== undefined) {
    if (parent === node) {
      parent = stack.pop();
      if (parent !== undefined) {
        parent.stats.time.total += node.stats.time.total;
      }
    } else {
      const children = node._children;
      queue.push(node);
      for (let i = children.length - 1; i >= 0; i--) {
        queue.push(children[i]);
      }
      if (parent) {
        stack.push(parent);
      }
      node.stats.time.total = node.stats.time.self;
      parent = node;
    }
  }
}

export = Builder;
