var quickTemp = require('quick-temp')

exports.Transformer = Transformer
function Transformer () {}

Transformer.prototype.read = function (readTree) {
  var self = this

  quickTemp.makeOrRemake(this, '_tmpDestDir')

  return readTree(this.inputTree)
    .then(function (dir) {
      return self.transform(dir, self._tmpDestDir)
    })
    .then(function () {
      return self._tmpDestDir
    })
}

Transformer.prototype.cleanup = function () {
  quickTemp.remove(this, '_tmpDestDir')
}

var filters = require('./transformers/filters')
exports.filters = filters
