var temp = require('temp')
temp.track()
var rimraf = require('rimraf')

exports.Transformer = Transformer
function Transformer () {}

Transformer.prototype.read = function (readTree) {
  var self = this

  if (this._destDirThatWillBeDeleted != null) {
    throw new Error('Transformer::read called without ::afterBuild')
  }

  // Super-explicit name so people don't set this to source directories in
  // subclasses and lose data
  this._destDirThatWillBeDeleted = temp.mkdirSync({
    prefix: 'broccoli-transformer-',
    suffix: '.tmp',
    dir: process.cwd()
  })

  return readTree(this.inputTree)
    .then(function (dir) {
      return self.transform(dir, self._destDirThatWillBeDeleted)
    })
    .then(function () {
      return self._destDirThatWillBeDeleted
    })
}

Transformer.prototype.afterBuild = function () {
  if (this._destDirThatWillBeDeleted == null) {
    throw new Error('Expected to have Transformer::_destDirThatWillBeDeleted set')
  }
  rimraf.sync(this._destDirThatWillBeDeleted)
  this._destDirThatWillBeDeleted = null
}


var filters = require('./transformers/filters')
exports.filters = filters
