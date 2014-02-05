var temp = require('temp')
temp.track()

exports.Transformer = Transformer
function Transformer () {}

Transformer.prototype.read = function (readTree) {
  var self = this

  var destDir = temp.mkdirSync({
    prefix: 'broccoli-transformer-',
    suffix: '.tmp',
    dir: process.cwd()
  })

  return readTree(this.inputTree)
    .then(function (dir) {
      return self.transform(dir, destDir)
    })
    .then(function () {
      return destDir
    })
}


var filters = require('./transformers/filters')
exports.filters = filters
