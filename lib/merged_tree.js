var RSVP = require('rsvp')

var helpers = require('./helpers')
var component = require('./component')


exports.MergedTree = MergedTree
MergedTree.prototype = Object.create(component.Component.prototype)
MergedTree.prototype.constructor = MergedTree
function MergedTree (trees) {
  this.addChildComponents(trees)
  this._trees = trees
}

MergedTree.prototype.read = function () {
  var destDir = this.makeTmpDir()

  return this._trees.reduce(function (promise, tree) {
      return promise
        .then(function () {
          return tree.withTimer(function () {
            return tree.read()
          })
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
