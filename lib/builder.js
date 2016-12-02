'use strict'

var path = require('path')
var fs = require('fs')
var RSVP = require('rsvp')
var tmp = require('tmp')
var rimraf = require('rimraf')
var underscoreString = require('underscore.string')
var WatchedDir = require('broccoli-source').WatchedDir
var broccoliNodeInfo = require('broccoli-node-info')

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup()


// For an explanation and reference of the API that we use to communicate with
// nodes (__broccoliFeatures__ and __broccoliGetInfo__), see
// https://github.com/broccolijs/broccoli/blob/master/docs/node-api.md


// Build a graph of nodes, referenced by its final output node. Example:
//
// var builder = new Builder(outputNode)
// builder.build()
//   .then(function() {
//     // Build output has been written to builder.outputPath
//   })
//   // To rebuild, call builder.build() repeatedly
//   .finally(function() {
//     // Delete temporary directories
//     builder.cleanup()
//   })
//
// Note that the API of this Builder may change between minor Broccoli
// versions. Backwards compatibility is only guaranteed for plugins, so any
// plugin that works with Broccoli 1.0 will work with 1.x.

module.exports = Builder
function Builder(outputNode, options) {
  if (options == null) options = {}

  this.outputNode = outputNode
  this.tmpdir = options.tmpdir // can be null

  this.unwatchedPaths = []
  this.watchedPaths = []

  // nodeWrappers store additional bookkeeping information, such as paths.
  // This array contains them in topological (build) order.
  this.nodeWrappers = []
  // This populates this.nodeWrappers as a side effect
  this.outputNodeWrapper = this.makeNodeWrapper(this.outputNode)

  // Catching missing directories here helps prevent later errors when we set
  // up the watcher.
  this.checkInputPathsExist()

  this.setupTmpDirs()

  // Now that temporary directories are set up, we need to run the rest of the
  // constructor in a try/catch block to clean them up if necessary.
  try {

    this.setupNodes()
    this.outputPath = this.outputNodeWrapper.outputPath
    this.buildId = 0

  } catch (e) {
    this.cleanup()
    throw e
  }
}

RSVP.EventTarget.mixin(Builder.prototype)

// Trigger a (re)build.
//
// Returns a promise that resolves when the build has finished. If there is a
// build error, the promise is rejected with a Builder.BuildError instance.
// This method will never throw, and it will never be rejected with anything
// other than a BuildError.
Builder.prototype.build = function() {
  var self = this
  this.buildId++
  var promise = RSVP.resolve()
  this.nodeWrappers.forEach(function(nw) {
    // We use `.forEach` instead of `for` to close nested functions over `nw`

    // Wipe all buildState objects at the beginning of the build
    nw.buildState = {}

    promise = promise
      .then(function() {
        // We use a nested .then/.catch so that the .catch can only catch errors
        // from this node, but not from previous nodes.
        return RSVP.resolve()
          .then(function() {
            self.trigger('beginNode', nw)
          })
          .then(function() {
            return nw.build()
          })
          .finally(function() {
            self.trigger('endNode', nw)
          })
          .catch(function(err) {
            throw new BuildError(err, nw)
          })
      })
  })
  return promise
}

// Destructor-like method. Cleanup is synchronous at the moment, but in the
// future we might change it to return a promise.
Builder.prototype.cleanup = function() {
  this.builderTmpDirCleanup()
}

// This method recursively traverses the node graph and returns a nodeWrapper.
// The nodeWrapper graph parallels the node graph 1:1.
Builder.prototype.makeNodeWrapper = function(node, _stack) {
  if (_stack == null) _stack = []
  var self = this

  // Dedupe nodes reachable through multiple paths
  for (var i = 0; i < this.nodeWrappers.length; i++) {
    if (this.nodeWrappers[i].originalNode === node) {
      return this.nodeWrappers[i]
    }
  }

  // Turn string nodes into WatchedDir nodes
  var originalNode = node // keep original (possibly string) node around for deduping
  if (typeof node === 'string') {
    node = new WatchedDir(node, { annotation: 'string node' })
  }

  // Call node.__broccoliGetInfo__()
  var nodeInfo
  try {
    nodeInfo = broccoliNodeInfo.getNodeInfo(node)
  } catch (e) {
    if (!(e instanceof broccoliNodeInfo.InvalidNodeError)) throw e
    // We don't have the instantiation stack of an invalid node, so to aid
    // debugging, we instead report its parent node
    var messageSuffix = (_stack.length > 0) ?
      '\nused as input node to ' + _stack[_stack.length-1].label +
        _stack[_stack.length-1].formatInstantiationStackForTerminal()
      : '\nused as output node'
    throw new broccoliNodeInfo.InvalidNodeError(e.message + messageSuffix)
  }

  // Compute label, like "Funnel (test suite)"
  var label = nodeInfo.name
  var labelExtras = []
  if (nodeInfo.nodeType === 'source') labelExtras.push(nodeInfo.sourceDirectory)
  if (nodeInfo.annotation != null) labelExtras.push(nodeInfo.annotation)
  if (labelExtras.length > 0) label += ' (' + labelExtras.join('; ') + ')'

  // We start constructing the nodeWrapper here because we'll need the partial
  // nodeWrapper for the _stack. Later we'll add more properties.
  var nodeWrapper = nodeInfo.nodeType === 'transform' ?
    new TransformNodeWrapper : new SourceNodeWrapper
  nodeWrapper.nodeInfo = nodeInfo
  nodeWrapper.originalNode = originalNode
  nodeWrapper.node = node
  nodeWrapper.label = label

  // Detect cycles
  for (i = 0; i < _stack.length; i++) {
    if (_stack[i].node === originalNode) {
      var cycleMessage = 'Cycle in node graph: '
      for (var j = i; j < _stack.length; j++) {
        cycleMessage += _stack[j].label + ' -> '
      }
      cycleMessage += nodeWrapper.label
      throw new BuilderError(cycleMessage)
    }
  }

  // For 'transform' nodes, recurse into the input nodes; for 'source' nodes,
  // record paths.
  var inputNodeWrappers = []
  if (nodeInfo.nodeType === 'transform') {
    var newStack = _stack.concat([nodeWrapper])
    inputNodeWrappers = nodeInfo.inputNodes.map(function(inputNode) {
      return self.makeNodeWrapper(inputNode, newStack)
    })
  } else { // nodeType === 'source'
    if (nodeInfo.watched) {
      this.watchedPaths.push(nodeInfo.sourceDirectory)
    } else {
      this.unwatchedPaths.push(nodeInfo.sourceDirectory)
    }
  }

  // For convenience, all nodeWrappers get an `inputNodeWrappers` array; for
  // 'source' nodes it's empty.
  nodeWrapper.inputNodeWrappers = inputNodeWrappers

  nodeWrapper.id = this.nodeWrappers.length

  // this.nodeWrappers will contain all the node wrappers in topological
  // order, i.e. each node comes after all its input nodes.
  //
  // It's unfortunate that we're mutating this.nodeWrappers as a side effect,
  // but since we work backwards from the output node to discover all the
  // input nodes, it's harder to do a side-effect-free topological sort.
  this.nodeWrappers.push(nodeWrapper)

  return nodeWrapper
}

Builder.prototype.features = broccoliNodeInfo.features

Builder.prototype.checkInputPathsExist = function() {
  // We might consider checking this.unwatchedPaths as well.
  for (var i = 0; i < this.watchedPaths.length; i++) {
    var isDirectory
    try {
      isDirectory = fs.statSync(this.watchedPaths[i]).isDirectory()
    } catch (err) {
      throw new Builder.BuilderError('Directory not found: ' + this.watchedPaths[i])
    }
    if (!isDirectory) {
      throw new Builder.BuilderError('Not a directory: ' + this.watchedPaths[i])
    }
  }
};

Builder.prototype.setupTmpDirs = function() {
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
  var tmpobj = tmp.dirSync({ prefix: 'broccoli-', unsafeCleanup: true, dir: this.tmpdir })
  this.builderTmpDir = tmpobj.name
  this.builderTmpDirCleanup = tmpobj.removeCallback
  for (var i = 0; i < this.nodeWrappers.length; i++) {
    var nodeWrapper = this.nodeWrappers[i]
    if (nodeWrapper.nodeInfo.nodeType === 'transform') {
      nodeWrapper.inputPaths = nodeWrapper.inputNodeWrappers.map(function(nw) {
        return nw.outputPath
      })
      nodeWrapper.outputPath = this.mkTmpDir(nodeWrapper, 'out')

      if (nodeWrapper.nodeInfo.needsCache) {
        nodeWrapper.cachePath = this.mkTmpDir(nodeWrapper, 'cache')
      }
    } else { // nodeType === 'source'
      // We could name this .sourcePath, but with .outputPath the code is simpler.
      nodeWrapper.outputPath = nodeWrapper.nodeInfo.sourceDirectory
    }
  }
}


// Create temporary directory, like
// /tmp/broccoli-9rLfJh/out-067-merge_trees_vendor_packages
// type is 'out' or 'cache'
Builder.prototype.mkTmpDir = function(nodeWrapper, type) {
  var nameAndAnnotation = nodeWrapper.nodeInfo.name + ' ' + (nodeWrapper.nodeInfo.annotation || '')
  // slugify turns fooBar into foobar, so we call underscored first to
  // preserve word boundaries
  var suffix = underscoreString.underscored(nameAndAnnotation.substr(0, 60))
  suffix = underscoreString.slugify(suffix).replace(/-/g, '_')
  // 1 .. 147 -> '001' .. '147'
  var paddedId = underscoreString.pad('' + nodeWrapper.id, ('' + this.nodeWrappers.length).length, '0')
  var dirname = type + '-' + paddedId + '-' + suffix
  var tmpDir = path.join(this.builderTmpDir, dirname)
  fs.mkdirSync(tmpDir)
  return tmpDir
}

Builder.prototype.setupNodes = function() {
  for (var i = 0; i < this.nodeWrappers.length; i++) {
    var nw = this.nodeWrappers[i]
    try {
      nw.setup(this.features)
    } catch (err) {
      throw new NodeSetupError(err, nw)
    }
  }
}


// Base class for builder errors
Builder.BuilderError = BuilderError
BuilderError.prototype = Object.create(Error.prototype)
BuilderError.prototype.constructor = BuilderError
function BuilderError(message) {
  // Subclassing Error in ES5 is non-trivial because reasons, so we need this
  // extra constructor logic from http://stackoverflow.com/a/17891099/525872.
  // Note that ES5 subclasses of BuilderError don't in turn need any special
  // code.
  var temp = Error.apply(this, arguments)
  // Need to assign temp.name for correct error class in .stack and .message
  temp.name = this.name = this.constructor.name
  this.stack = temp.stack
  this.message = temp.message
}

Builder.InvalidNodeError = broccoliNodeInfo.InvalidNodeError

Builder.NodeSetupError = NodeSetupError
NodeSetupError.prototype = Object.create(BuilderError.prototype)
NodeSetupError.prototype.constructor = NodeSetupError
function NodeSetupError(originalError, nodeWrapper) {
  if (nodeWrapper == null) { // Chai calls new NodeSetupError() :(
    BuilderError.call(this)
    return
  }
  originalError = wrapPrimitiveErrors(originalError)
  var message = originalError.message +
    '\nat ' + nodeWrapper.label +
    nodeWrapper.formatInstantiationStackForTerminal()
  BuilderError.call(this, message)
  // The stack will have the original exception name, but that's OK
  this.stack = originalError.stack
}

Builder.BuildError = BuildError
BuildError.prototype = Object.create(BuilderError.prototype)
BuildError.prototype.constructor = BuildError
function BuildError(originalError, nodeWrapper) {
  if (nodeWrapper == null) { // for Chai
    BuilderError.call(this)
    return
  }

  originalError = wrapPrimitiveErrors(originalError)

  // Create heavily augmented message for easy printing to the terminal. Web
  // interfaces should refer to broccoliPayload.originalError.message instead.
  var filePart = ''
  if (originalError.file != null) {
    filePart = originalError.file
    if (originalError.line != null) {
      filePart += ':' + originalError.line
      if (originalError.column != null) {
        // .column is zero-indexed
        filePart += ':' + (originalError.column + 1)
      }
    }
    filePart += ': '
  }
  var instantiationStack = ''
  if (originalError.file == null) {
    // We want to report the instantiation stack only for "unexpected" errors
    // (bugs, internal errors), but not for compiler errors and such. For now,
    // the presence of `.file` serves as a heuristic to distinguish between
    // those cases.
    instantiationStack = nodeWrapper.formatInstantiationStackForTerminal()
  }
  var message = filePart + originalError.message +
    (originalError.treeDir ? '\n        in ' + originalError.treeDir : '') +
    '\n        at ' + nodeWrapper.label +
    instantiationStack

  BuilderError.call(this, message)
  this.stack = originalError.stack

  // This error API can change between minor Broccoli version bumps
  this.broccoliPayload = {
    originalError: originalError, // guaranteed to be error object, not primitive
    originalMessage: originalError.message,
    // node info
    nodeId: nodeWrapper.id,
    nodeLabel: nodeWrapper.label,
    nodeName: nodeWrapper.nodeInfo.name,
    nodeAnnotation: nodeWrapper.nodeInfo.annotation,
    instantiationStack: nodeWrapper.nodeInfo.instantiationStack,
    // error location (if any)
    location: {
      file: originalError.file,
      treeDir: originalError.treeDir,
      line: originalError.line,
      column: originalError.column
    }
  }
}


Builder.NodeWrapper = NodeWrapper
function NodeWrapper() {
  this.buildState = {}
}

Builder.TransformNodeWrapper = TransformNodeWrapper
TransformNodeWrapper.prototype = Object.create(NodeWrapper.prototype)
TransformNodeWrapper.prototype.constructor = TransformNodeWrapper
function TransformNodeWrapper() {
  NodeWrapper.apply(this, arguments)
}

Builder.SourceNodeWrapper = SourceNodeWrapper
SourceNodeWrapper.prototype = Object.create(NodeWrapper.prototype)
SourceNodeWrapper.prototype.constructor = SourceNodeWrapper
function SourceNodeWrapper() {
  NodeWrapper.apply(this, arguments)
}

TransformNodeWrapper.prototype.setup = function(features) {
  this.nodeInfo.setup(features, {
    inputPaths: this.inputPaths,
    outputPath: this.outputPath,
    cachePath: this.cachePath
  })
  this.callbackObject = this.nodeInfo.getCallbackObject()
}

SourceNodeWrapper.prototype.setup = function(features) {
}

// Call node.build(), plus bookkeeping
TransformNodeWrapper.prototype.build = function() {
  var self = this

  var startTime = process.hrtime()

  if (!this.nodeInfo.persistentOutput) {
    rimraf.sync(this.outputPath)
    fs.mkdirSync(this.outputPath)
  }

  return RSVP.resolve(self.callbackObject.build())

    .then(function() {
      var now = process.hrtime()
      // Build time in milliseconds
      self.buildState.selfTime = 1000 * ((now[0] - startTime[0]) + (now[1] - startTime[1]) / 1e9)
      self.buildState.totalTime = self.buildState.selfTime
      for (var i = 0; i < self.inputNodeWrappers.length; i++) {
        self.buildState.totalTime += self.inputNodeWrappers[i].buildState.totalTime
      }
    })
}

SourceNodeWrapper.prototype.build = function() {
  // We only check here that the sourceDirectory exists and is a directory
  try {
    if (!fs.statSync(this.nodeInfo.sourceDirectory).isDirectory()) {
      throw new Error('Not a directory')
    }
  } catch (err) { // stat might throw, or we might throw
    err.file = this.nodeInfo.sourceDirectory
    // fs.stat augments error message with file name, but that's redundant
    // with our err.file, so we strip it
    err.message = err.message.replace(/, stat '[^'\n]*'$/m, '')
    throw err
  }

  this.buildState.selfTime = 0
  this.buildState.totalTime = 0
}

TransformNodeWrapper.prototype.toString = function() {
  var hint = this.label
  hint = this.label
  if (this.inputNodeWrappers) { // a bit defensive to deal with partially-constructed node wrappers
    hint += ' inputNodeWrappers:[' + this.inputNodeWrappers.map(function(nw) { return nw.id }) + ']'
  }
  hint += ' at ' + this.outputPath
  if (this.buildState.selfTime != null) {
    hint += ' (' + Math.round(this.buildState.selfTime) + ' ms)'
  }
  return '[NodeWrapper:' + this.id + ' ' + hint + ']'
}

SourceNodeWrapper.prototype.toString = function() {
  var hint = this.nodeInfo.sourceDirectory +
    (this.nodeInfo.watched ? '' : ' (unwatched)')
  return '[NodeWrapper:' + this.id + ' ' + hint + ']'
}

NodeWrapper.prototype.toJSON = function() {
  return undefinedToNull({
    id: this.id,
    nodeInfo: this.nodeInfoToJSON(),
    buildState: this.buildState,
    label: this.label,
    inputNodeWrappers: this.inputNodeWrappers.map(function(nw) { return nw.id }),
    cachePath: this.cachePath,
    outputPath: this.outputPath
    // leave out node, originalNode, inputPaths (redundant), build
  })
}

TransformNodeWrapper.prototype.nodeInfoToJSON = function() {
  return undefinedToNull({
    nodeType: 'transform',
    name: this.nodeInfo.name,
    annotation: this.nodeInfo.annotation,
    persistentOutput: this.nodeInfo.persistentOutput,
    needsCache: this.nodeInfo.needsCache
    // leave out instantiationStack (too long), inputNodes, and callbacks
  })
}

SourceNodeWrapper.prototype.nodeInfoToJSON = function() {
  return undefinedToNull({
    nodeType: 'source',
    sourceDirectory: this.nodeInfo.sourceDirectory,
    watched: this.nodeInfo.watched,
    name: this.nodeInfo.name,
    annotation: this.nodeInfo.annotation
    // leave out instantiationStack
  })
}

NodeWrapper.prototype.formatInstantiationStackForTerminal = function() {
  return '\n-~- created here: -~-\n' + this.nodeInfo.instantiationStack + '\n-~- (end) -~-'
}


// Replace all `undefined` values with `null`, so that they show up in JSON output
function undefinedToNull(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key) && obj[key] === undefined) {
      obj[key] = null
    }
  }
  return obj
}

function wrapPrimitiveErrors(err) {
  if (err !== null && typeof err === 'object') {
    return err
  } else {
    // We could augment the message with " [string exception]" to indicate
    // that the stack trace is not useful, or even set the .stack to null.
    return new Error(err + '')
  }
}
