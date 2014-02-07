var RSVP = require('rsvp')
var temp = require('temp')
temp.track()
var rimraf = require('rimraf')

var helpers = require('./helpers')


exports.MergedTree = MergedTree
function MergedTree (trees) {
  this._trees = trees
}

MergedTree.prototype.read = function (readTree) {
  var self = this

  this._destDirThatWillBeDeleted = temp.mkdirSync({
    prefix: 'broccoli-merged-tree-',
    suffix: '.tmp',
    dir: process.cwd()
  })

  return this._trees.reduce(function (promise, tree) {
      return promise
        .then(function () {
          return readTree(tree)
        })
        .then(function (treeDir) {
          helpers.linkRecursivelySync(treeDir, self._destDirThatWillBeDeleted)
        })
    }, RSVP.resolve())
    .then(function () {
      return self._destDirThatWillBeDeleted
    })
}

MergedTree.prototype.afterBuild = function () {
  if (this._destDirThatWillBeDeleted == null) {
    throw new Error('Expected to have MergedTree::_destDirThatWillBeDeleted set')
  }
  rimraf.sync(this._destDirThatWillBeDeleted)
}
