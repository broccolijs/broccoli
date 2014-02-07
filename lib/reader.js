var helpers = require('./helpers')


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

Reader.prototype.statsHash = function () {
  return helpers.hashTree(this.dir)
}

exports.read = read
function read (dir) {
  return new Reader(dir)
}
