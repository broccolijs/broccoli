'use strict'

var path = require('path')
var fs = require('fs')
var findup = require('findup-sync')
var RSVP = require('rsvp')
var tmp = require('tmp')
var rimraf = require('rimraf')
var underscoreString = require('underscore.string')
var WatchedDir = require('broccoli-source').WatchedDir


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

exports.Builder = Builder
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

  this.setupTmpDirs()

  // Now that temporary directories are set up, we need to run the rest of the
  // constructor in a try/catch block to clean them up if necessary.
  try {

    this.setupNodes()
    this.outputPath = this.outputNodeWrapper.outputPath

  } catch (e) {
    this.cleanup()
    throw e
  }

  this.buildId = 0
}

Builder.prototype.build = function() {
  // This method essentially does
  //     for each nodeWrapper in this.nodeWrappers
  //       nodeWrapper.build()
  // plus a bunch of bookkeeping.
  var self = this
  this.buildId++
  var promise = RSVP.resolve()
  promise = promise.then(function() { self.trigger('beginBuild') })
  this.nodeWrappers.forEach(function(nw) {
    // We use `.forEach` instead of `for` to close nested functions over `nw`

    // Wipe all buildState objects at the beginning of the build
    nw.buildState = {}

    var startTime
    function beginNode() {
      startTime = process.hrtime()
      self.trigger('beginNode', nw)
    }
    function endNode() {
      if (nw.nodeInfo.nodeType === 'transform') {
        var now = process.hrtime()
        // Build time in milliseconds
        nw.buildState.selfTime = 1000 * ((now[0] - startTime[0]) + (now[1] - startTime[1]) / 1e9)
        nw.buildState.totalTime = nw.buildState.selfTime
        for (var i = 0; i < nw.inputNodeWrappers.length; i++) {
          nw.buildState.totalTime += nw.inputNodeWrappers[i].buildState.totalTime
        }
      } else {
        nw.buildState.selfTime = 0
        nw.buildState.totalTime = 0
      }
      self.trigger('endNode', nw)
    }

    function cleanOutputDirectoryIfNecessary() {
      // It would be so much nicer to have a TransformNodeWrapper subclass,
      // which implements TransformNodeWrapper::build
      if (nw.nodeInfo.nodeType === 'transform' && !nw.nodeInfo.persistentOutput) {
        rimraf.sync(nw.outputPath)
        fs.mkdirSync(nw.outputPath)
      }
    }

    promise = promise
      .then(beginNode)
      .then(function() {
        // We use a nested .then/.catch so that the .catch can only catch errors
        // from this node, but not from previous nodes.
        return RSVP.resolve()
          .then(function() {
            cleanOutputDirectoryIfNecessary()
            return nw.build()
          })
          .finally(endNode)
          .catch(function(err) {
            throw new BuildError(err, nw)
          })
      })
  })
  promise = promise.finally(function() { self.trigger('endBuild') })
  return promise
}

// Destructor-like method. Cleanup is synchronous at the moment, but in the
// future it might return a promise.
Builder.prototype.cleanup = function() {
  this.builderTmpDirCleanup()
}

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

  // Check that `node` is in fact a Broccoli node
  if (node == null || !node.__broccoliGetInfo__) {
    var message = ''
    if (node != null && (typeof node.read === 'function' || typeof node.rebuild === 'function')) {
      var legacyNodeDescription = (node && node.description) ||
        (node && node.constructor && node.constructor.name) ||
        ('' + node)
      message = 'The .read/.rebuild API is no longer supported as of Broccoli 1.0. ' +
        'Plugins must now derive from broccoli-plugin. Got .read/.rebuild based node "' + legacyNodeDescription + '"'
    } else {
      message = 'Expected Broccoli node, got ' + node
    }
    if (_stack.length > 0) {
      throw new InvalidNodeError(message + '\nused as input node to ' + _stack[_stack.length-1].label +
        formatInstantiationStack(_stack[_stack.length-1])
      )
    } else {
      throw new InvalidNodeError(message + ' as output node')
    }
  }

  var nodeInfo = this.getNodeInfo(node)

  // Compute label, like "Funnel (test suite)"
  var label = nodeInfo.name
  var labelExtras = []
  if (nodeInfo.nodeType === 'source') labelExtras.push(nodeInfo.sourceDirectory)
  if (nodeInfo.annotation != null) labelExtras.push(nodeInfo.annotation)
  if (labelExtras.length > 0) label += ' (' + labelExtras.join('; ') + ')'

  // We start constructing the nodeWrapper here because we'll need the partial
  // nodeWrapper for the _stack. Later we'll add more properties.
  var nodeWrapper = new NodeWrapper
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

  // All nodeWrappers get an `inputNodeWrappers` array; for 'source' nodes
  // it's empty.
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

// This list of [feature, augmentationFunction] pairs is used to maintain
// backwards compatibility with older broccoli-plugin versions.
//
// If a plugin doesn't support `feature`, then `augmentationFunction` is
// called on its node info (as returned by node.__broccoliGetInfo__())
// in order to bring the interface up-to-date. If a plugin is missing several
// features, each `augmentationFunction` is applied in succession.
//
// Note that feature flags are not independent; every feature flag requires
// the earlier flags to be set as well.
//
// Add new features to the bottom of the list.
var augmenters = [
  [
    'persistentOutputFlag', function(nodeInfo) {
      nodeInfo.persistentOutput = false
    }
  ], [
    'sourceDirectories', function(nodeInfo) {
      nodeInfo.nodeType = 'transform'
    }
  ]
]

Builder.prototype.features = {}
for (var i = 0; i < augmenters.length; i++) {
  Builder.prototype.features[augmenters[i][0]] = true
}

Builder.prototype.getNodeInfo = function(node) {
  var features = {}

  // Discover features we have in common
  for (var i = 0; i < augmenters.length; i++) {
    var feature = augmenters[i][0]
    if (!node.__broccoliFeatures__[feature]) {
      break
    }
    features[feature] = true
  }

  // Get the node info. Note that we're passing the builder's full
  // feature set (`this.features`) rather than the smaller feature set we're
  // mimicking (`features`). This is a fairly arbitrary choice, but it's
  // easier to implement, and it usually won't make a difference because the
  // Plugin class won't care about features it doesn't know about.
  var nodeInfo = node.__broccoliGetInfo__(this.features)

  // Augment the interface with the new features that the plugin doesn't support
  for (; i < augmenters.length; i++) {
    var fn = augmenters[i][1]
    // Use prototypal inheritance to avoid mutating other people's objects
    nodeInfo = Object.create(nodeInfo)
    fn(nodeInfo)
  }

  // We generally trust the nodeInfo to be valid, but unexpected
  // nodeTypes could break our code paths really badly, and some of those
  // paths call rimraf, so we check that to be safe.
  if (nodeInfo.nodeType !== 'transform' && nodeInfo.nodeType !== 'source') {
    throw new Error('Assertion error: Unexpected nodeType: ' + nodeInfo.nodeType)
  }

  return nodeInfo
}

Builder.prototype.setupTmpDirs = function() {
  // Create temporary directories for each node:
  //
  // out-01-someplugin/
  // out-02-otherplugin/
  // cache-01-someplugin/
  // cache-02-otherplugin/
  //
  // Here's an alternative directory structure we might consider (it's not
  // clear which structure makes debugging easier):
  //
  //   01/
  //     out/
  //     cache/
  //     in-01 -> ... // symlink for convenience
  //     in-02 -> ...
  //   02/
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
      nodeWrapper.cachePath = this.mkTmpDir(nodeWrapper, 'cache')
    } else { // nodeType === 'source'
      // We could name this .sourcePath, but with .outputPath the code is simpler.
      nodeWrapper.outputPath = nodeWrapper.nodeInfo.sourceDirectory
    }
  }
}

Builder.prototype.mkTmpDir = function(nodeWrapper, type) {
  // slugify turns fooBar into foobar, so we call underscored first to
  // preserve word boundaries
  var suffix = underscoreString.underscored(nodeWrapper.label.substr(0, 60))
  suffix = underscoreString.slugify(suffix).replace(/-/g, '_')
  var paddedIndex = underscoreString.pad('' + nodeWrapper.id, ('' + this.nodeWrappers.length).length, '0')
  var dirname = type + '-' + paddedIndex + '-' + suffix
  var tmpDir = path.join(this.builderTmpDir, dirname)
  fs.mkdirSync(tmpDir)
  return tmpDir
}

Builder.prototype.setupNodes = function() {
  for (var i = 0; i < this.nodeWrappers.length; i++) {
    var nw = this.nodeWrappers[i]
    try {
      if (nw.nodeInfo.nodeType === 'transform') {
        nw.nodeInfo.setup(this.features, {
          inputPaths: nw.inputPaths,
          outputPath: nw.outputPath,
          cachePath: nw.cachePath
        })
        var callbackObject = nw.nodeInfo.getCallbackObject()
        nw.build = callbackObject.build.bind(callbackObject)
      } else { // nodeType === 'source'
        nw.build = this.checkDirectoryExistence.bind(this, nw.nodeInfo.sourceDirectory)
      }
    } catch (err) {
      // Rethrow, reporting instantiation stack of offending node
      throw new NodeSetupError(err, nw)
    }
  }
}

Builder.prototype.checkDirectoryExistence = function(sourcePath) {
  try {
    if (!fs.statSync(sourcePath).isDirectory()) {
      throw new Error('Not a directory')
    }
  } catch (err) {
    err.file = sourcePath
    // fs.stat augments error message with file name, but that's redundant
    // with our err.file, so we strip it
    err.message = err.message.replace(/, stat '[^'\n]*'$/m, '')
    throw err
  }
}

RSVP.EventTarget.mixin(Builder.prototype)


exports.loadBrocfile = loadBrocfile
function loadBrocfile () {
  var brocfile = findup('Brocfile.js', {
    nocase: true
  })

  if (brocfile == null) throw new Error('Brocfile.js not found')

  var baseDir = path.dirname(brocfile)

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir)

  var tree = require(brocfile)

  return tree
}


// Base class for builder errors
Builder.BuilderError = BuilderError
BuilderError.prototype = Object.create(Error.prototype)
BuilderError.prototype.constructor = BuilderError
function BuilderError(message) {
  // Subclassing Error in ES5 is non-trivial because reasons, so we need this
  // extra constructor logic from http://stackoverflow.com/a/17891099/525872.
  // Once we use ES6 classes we can get rid of this code (maybe except for
  // .name - see https://code.google.com/p/chromium/issues/detail?id=542707).
  // Note that ES5 subclasses of BuilderError don't in turn need any special
  // code.
  var temp = Error.apply(this, arguments)
  // Need to assign temp.name for correct error class in .stack and .message
  temp.name = this.name = this.constructor.name
  this.stack = temp.stack
  this.message = temp.message
}

Builder.InvalidNodeError = InvalidNodeError
InvalidNodeError.prototype = Object.create(BuilderError.prototype)
InvalidNodeError.prototype.constructor = InvalidNodeError
function InvalidNodeError(message) {
  BuilderError.call(this, message)
}

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
    formatInstantiationStack(nodeWrapper)
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
  var fileSnippet = ''
  if (originalError.file != null) {
    fileSnippet = originalError.file
    if (originalError.line != null) {
      fileSnippet += ':' + originalError.line
      if (originalError.column != null) {
        // .column is zero-indexed
        fileSnippet += ':' + (originalError.column + 1)
      }
    }
    fileSnippet += ': '
  }
  var instantiationStack = ''
  if (originalError.file == null) {
    // We want to report the instantiation stack only for "unexpected" errors
    // (bugs, internal errors), but not for compiler errors and such. For now,
    // the presence of `.file` serves as a heuristic to distinguish between
    // those cases.
    instantiationStack = formatInstantiationStack(nodeWrapper)
  }
  var message = fileSnippet + originalError.message +
    (originalError.treeDir ? '\n        in ' + originalError.treeDir : '') +
    '\n        at ' + nodeWrapper.label +
    instantiationStack

  BuilderError.call(this, message)
  this.stack = originalError.stack

  // This error API can change between minor Broccoli version bumps
  this.broccoliPayload = {
    originalError: originalError,
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
}

NodeWrapper.prototype.toString = function() {
  var hint
  if (this.nodeInfo.nodeType === 'transform') {
    hint = this.label
    if (this.inputNodeWrappers) { // a bit defensive to deal with partially-constructed node wrappers
      hint += ' inputNodeWrappers:[' + this.inputNodeWrappers.map(function(nw) { return nw.id }) + ']'
    }
    hint += ' at ' + this.outputPath
    if (this.buildState) {
      hint += ' (' + Math.round(this.buildState.selfTime) + ' ms)'
    }
  } else { // nodeType === 'source'
    hint = this.nodeInfo.sourceDirectory +
      (this.nodeInfo.watched ? '' : ' (unwatched)')
  }
  return '[NodeWrapper:' + this.id + ' ' + hint + ']'
}

NodeWrapper.prototype.toJSON = function() {
  return undefinedToNull({
    id: this.id,
    nodeInfo: nodeInfoToJSON(this.nodeInfo),
    buildState: this.buildState || null,
    label: this.label,
    inputNodeWrappers: this.inputNodeWrappers.map(function(nw) { return nw.id }),
    cachePath: this.cachePath,
    outputPath: this.outputPath
    // leave out node, originalNode, inputPaths (redundant), build
  })
}

function nodeInfoToJSON(nodeInfo) {
  if (nodeInfo.nodeType === 'transform') {
    return undefinedToNull({
      nodeType: 'transform',
      name: nodeInfo.name,
      annotation: nodeInfo.annotation,
      persistentOutput: nodeInfo.persistentOutput
      // leave out instantiationStack (too long), inputNodes, and callbacks
    })
  } else { // nodeType === 'source'
    return undefinedToNull({
      nodeType: 'source',
      sourceDirectory: nodeInfo.sourceDirectory,
      watched: nodeInfo.watched,
      name: nodeInfo.name,
      annotation: nodeInfo.annotation,
      // leave out instantiationStack
    })
  }
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

function formatInstantiationStack(nodeWrapper) {
  return '\n-~- created here: -~-\n' + nodeWrapper.nodeInfo.instantiationStack + '\n-~- (end) -~-'
}
