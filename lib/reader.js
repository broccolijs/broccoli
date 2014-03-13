var helpers = require('broccoli-kitchen-sink-helpers')


exports.Reader = Reader
function Reader (dir) {
  this.dir = dir
}

Reader.prototype.toString = function () {
  return '[object Reader:' + this.dir + ']'
}

Reader.prototype.read = function (readTree) {
  return this.dir
}

Reader.prototype.cleanup = function () {
}

Reader.prototype.statsHash = function () {
  return helpers.hashTree(this.dir)
}

exports.makeTree = makeTree
function makeTree (dir) {
  return new Reader(dir)
}
