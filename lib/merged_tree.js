var RSVP = require('rsvp')
var quickTemp = require('quick-temp')
var rimraf = require('rimraf')

var helpers = require('./helpers')


exports.MergedTree = MergedTree
function MergedTree (trees) {
  this._trees = trees
}

MergedTree.prototype.read = function (readTree) {
  var self = this

  quickTemp.makeOrRemake(this, '_tmpDestDir')

  return this._trees.reduce(function (promise, tree) {
      return promise
        .then(function () {
          return readTree(tree)
        })
        .then(function (treeDir) {
          // Should refuse overwriting
          helpers.linkRecursivelySync(treeDir, self._tmpDestDir)
        })
    }, RSVP.resolve())
    .then(function () {
      return self._tmpDestDir
    })
}

MergedTree.prototype.cleanup = function () {
  quickTemp.remove(this, '_tmpDestDir')
}
