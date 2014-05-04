var path = require('path')
var findup = require('findup-sync')
var Promise = require('rsvp').Promise


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.allTreesRead = [] // across all builds
}

Builder.prototype.build = function (willReadStringTree) {
  var self = this

  var newTreesRead = []
  var nodeCache = []

  return Promise.resolve()
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
    // To do: Complain about parallel execution
    // To do: Timing
    var index = newTreesRead.indexOf(tree)
    if (index !== -1) {
      // Return node from cache to deduplicate `.read`
      if (nodeCache[index].directory == null) {
        // node.directory gets set at the very end, so we have found an as-yet
        // incomplete node. This can happen if there is a cycle.
        throw new Error('Tree cycle detected')
      }
      return Promise.resolve(nodeCache[index])
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
      treeDirPromise = Promise.resolve()
        .then(function () {
          if (willReadStringTree) willReadStringTree(tree)
          return tree
        })
    } else if (!tree || typeof tree.read !== 'function') {
      throw new Error('Invalid tree found. You must supply a path or an object with a `read` function.');
    } else {
      var now = process.hrtime()
      var totalStartTime = now
      var selfStartTime = now
      var readTreeRunning = false
      treeDirPromise = Promise.resolve()
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

            return Promise.resolve()
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
  for (var i = 0; i < this.allTreesRead.length; i++) {
    var tree = this.allTreesRead[i]
    if (typeof tree !== 'string') {
      tree.cleanup()
    }
  }
}


exports.loadBrocfile = loadBrocfile
function loadBrocfile () {
  var brocfile = findup('Brocfile.js', {nocase: true})
  if (brocfile == null) {
    throw new Error('Brocfile.js not found (note: was previously Broccolifile.js)')
  }

  var baseDir = path.dirname(brocfile)

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir)

  var tree = require(brocfile)

  if (typeof tree === 'function') {
    throw new Error('Exporting a function in Brocfile.js is no longer supported. ' +
      'Export a tree instead. To update, turn this\n' +
      '\n' +
      '    module.exports = function (broccoli) {\n' +
      '      ...\n' +
      '      return someTree;\n' +
      '    };\n' +
      '\n' +
      'into this\n' +
      '\n' +
      '    ...\n' +
      '    module.exports = someTree;\n')
  }
  if (Array.isArray(tree)) {
    throw new Error('Returning an array from Brocfile.js is no longer supported\n' +
      'Run "npm install --save-dev broccoli-merge-trees" and use it like so in Brocfile.js:\n' +
      'var mergeTrees = require(\'broccoli-merge-trees\');\n' +
      'return mergeTrees([tree1, tree2, tree3], { overwrite: true });')
  }

  return tree
}
