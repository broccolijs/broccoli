var RSVP = require('rsvp')

var helpers = require('./helpers')
var TmpDirManager = require('./tmp_dir_manager').TmpDirManager


exports.MergedTree = MergedTree
function MergedTree (injector, trees) {
  this.injector = injector
  this._trees = trees
}

MergedTree.prototype.read = function () {
  var destDir = this.injector.get(TmpDirManager).makeTmpDir('merged_tree')

  return this._trees.reduce(function (promise, tree) {
      return promise
        .then(function () {
          return tree.read()
        })
        .then(function (treeDir) {
          helpers.linkRecursivelySync(treeDir, destDir)
        })
    }, RSVP.resolve())
    .then(function () {
      return destDir
    })
}

MergedTree.prototype.statsHash = function () {
  return this._trees.map(function (tree) {
    return tree.statsHash()
  }).join('\x00')
}
