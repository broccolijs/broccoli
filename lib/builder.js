var path = require('path')
var findup = require('findup-sync')
var Promise = require('rsvp').Promise


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.treesRead = [] // last build
  this.allTreesRead = [] // across all builds
  process.addListener('exit', this.cleanup.bind(this))
}

Builder.prototype.build = function () {
  var self = this

  var newTreesRead = []
  var dirsCache = []

  return Promise.resolve()
    .then(function () {
      return getReadTreeFn(null)(self.tree) // call self.tree.read()
    })
    .then(function (dir) {
      self.treesRead = newTreesRead
      return dir
    }, function (err) {
      // self.treesRead is used by the watcher. Do not stop watching
      // directories if the build errors in the middle, or we get double
      // rebuilds.
      if (newTreesRead.length > self.treesRead.length) {
        self.treesRead = newTreesRead
      }
      throw err
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

  function getReadTreeFn (tree) {
    function readTree (subtree) {
      // To do: Complain about parallel execution
      // To do: Timing
      var index = newTreesRead.indexOf(subtree)
      if (index === -1) {
        newTreesRead.push(subtree)
        dirsCache.push(null)
        index = dirsCache.length - 1
        var subtreeDir = typeof subtree === 'string' ?
           subtree :
           subtree.read(getReadTreeFn(subtree))
        return Promise.resolve(subtreeDir)
          .then(function (dir) {
            if (dir == null) throw new Error(subtree + ': .read must return a directory')
            dirsCache[index] = dir
            return dir
          })
      } else {
        // Do not re-run .read; just return the cached directory path
        if (dirsCache[index] == null) throw new Error('Tree cycle detected')
        return Promise.resolve(dirsCache[index])
      }
    }
    return readTree
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

  var broccoli = require('./index')
  var tree = require(brocfile)(broccoli)

  if (Array.isArray(tree)) {
    var MergedTree = require('./merged_tree').MergedTree
    tree = new MergedTree(tree)
  }
  return tree
}
