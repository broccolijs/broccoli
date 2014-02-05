var RSVP = require('rsvp')
var temp = require('temp')
temp.track()

var helpers = require('./helpers')


exports.MergedTree = MergedTree
function MergedTree (trees) {
  this._trees = trees
}

MergedTree.prototype.read = function (readTree) {
  var destDir = temp.mkdirSync({
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
