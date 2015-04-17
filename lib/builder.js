var path = require('path')
var findup = require('findup-sync')
var RSVP = require('rsvp')
var mapSeries = require('promise-map-series')
var readAPICompat = require('broccoli-read-compat')


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.allTreesRead = [] // across all builds
}

Builder.prototype.build = function (willReadStringTree) {
  var self = this

  var newTreesRead = []
  var nodeCache = []

  return RSVP.resolve()
    .then(function () {
      return readAndReturnNodeFor(self.tree) // call self.tree.read()
    })
    .then(function (node) {
      return { directory: node.directory, graph: node, totalTime: node.totalTime }
    })
    .finally(function () {
      for (var i = 0; i < newTreesRead.length; i++) {
        if (self.allTreesRead.indexOf(newTreesRead[i]) === -1) {
          self.allTreesRead.push(newTreesRead[i])
        }
      }
    })
    .catch(function (err) {
      if (typeof err === 'string') {
        err = new Error(err + ' [string exception]')
      }
      throw err
    })

  // Read the `tree` and return its node, which in particular contains the
  // tree's output directory (node.directory)
  function readAndReturnNodeFor (tree) {
    tree = self.wrapIfNecessary(tree)
    var index = newTreesRead.indexOf(tree)
    if (index !== -1) {
      // Return node from cache to deduplicate `.read`
      if (nodeCache[index].directory == null) {
        // node.directory gets set at the very end, so we have found an as-yet
        // incomplete node. This can happen if there is a cycle.
        throw new Error('Tree cycle detected')
      }
      return RSVP.resolve(nodeCache[index])
    }
    var node = {
      tree: tree,
      subtrees: [],
      selfTime: 0,
      totalTime: 0
    }
    newTreesRead.push(tree)
    nodeCache.push(node)
    var treeDirPromise
    if (typeof tree === 'string') {
      treeDirPromise = RSVP.resolve()
        .then(function () {
          if (willReadStringTree) willReadStringTree(tree)
          return tree
        })
    } else if (!tree || (typeof tree.read !== 'function' && typeof tree.rebuild !== 'function')) {
      throw new Error('Invalid tree found. You must supply a path or an object with a `.read` (deprecated) or `.rebuild` function: ' + getDescription(tree))
    } else {
      var now = process.hrtime()
      var totalStartTime = now
      var selfStartTime = now
      var readTreeRunning = false
      treeDirPromise = RSVP.resolve()
        .then(function () {
          return tree.read(function readTree (subtree) {
            if (readTreeRunning) {
              throw new Error('Parallel readTree call detected; read trees in sequence, e.g. using https://github.com/joliss/promise-map-series')
            }
            readTreeRunning = true

            // Pause self timer
            var now = process.hrtime()
            node.selfTime += (now[0] - selfStartTime[0]) * 1e9 + (now[1] - selfStartTime[1])
            selfStartTime = null

            return RSVP.resolve()
              .then(function () {
                return readAndReturnNodeFor(subtree) // recurse
              })
              .then(function (childNode) {
                node.subtrees.push(childNode)
                return childNode.directory
              })
              .finally(function () {
                readTreeRunning = false
                // Resume self timer
                selfStartTime = process.hrtime()
              })
          })
        })
        .then(function (dir) {
          if (readTreeRunning) {
            throw new Error('.read returned before readTree finished')
          }

          var now = process.hrtime()
          node.selfTime += (now[0] - selfStartTime[0]) * 1e9 + (now[1] - selfStartTime[1])
          node.totalTime += (now[0] - totalStartTime[0]) * 1e9 + (now[1] - totalStartTime[1])
          return dir
        })
    }
    return treeDirPromise
      .then(function (treeDir) {
        if (treeDir == null) throw new Error(tree + ': .read must return a directory')
        node.directory = treeDir
        return node
      })
  }
}

Builder.prototype.cleanup = function () {
  function cleanupTree(tree) {
    if (typeof tree !== 'string') {
      return tree.cleanup()
    }
  }

  return mapSeries(this.allTreesRead, cleanupTree)
}

Builder.prototype.wrapIfNecessary = function (tree) {
  if (tree.isReadAPICompatTree) {
    return tree;
  } else if (typeof tree.rebuild === 'function') {
    // Note: We wrap even if the plugin provides a `.read` function, so that
    // its new `.rebuild` function gets called.
    if (!tree.wrappedTree) { // memoize
      tree.wrappedTree = readAPICompat.wrapInstance(tree)
    }
    return tree.wrappedTree
  } else {
    if (process.env.BROCCOLI_WARN_READ_API &&
        typeof tree.read === 'function' &&
        !tree.suppressDeprecationWarning) {
      if (!this.printedWarningIntro) {
        console.warn('[API] Note: Upcoming API change: https://github.com/broccolijs/broccoli/blob/master/docs/new-rebuild-api.md')
        console.warn('[API] Note: Plugins only providing old `.read` API will stop working in Broccoli 0.16')
        this.printedWarningIntro = true
      }
      console.warn('[API] Warning: Plugin only provides old `.read` API: ' + getDescription(tree))
      tree.suppressDeprecationWarning = true
    }
    return tree
  }
}


exports.loadBrocfile = loadBrocfile
function loadBrocfile () {
  var brocfile = findup('Brocfile.js', {nocase: true})
  if (brocfile == null) throw new Error('Brocfile.js not found')

  var baseDir = path.dirname(brocfile)

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir)

  var tree = require(brocfile)

  return tree
}


function getDescription (tree) {
  return (tree && tree.description) ||
    (tree && tree.constructor && tree.constructor.name) ||
    ('' + tree)
}
