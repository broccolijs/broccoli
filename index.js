var fs = require('fs')
var EventEmitter = require('events').EventEmitter
// how to configure compilers + concaters?

exports.Processor = function(compiler, concatenator) {
  this.compiler = compiler
  this.concatenator = concatenator
}

exports.Processor.prototype.request = function(path, callback) {
  var self = this
  var inFileStream = this.readFile(path)
  var inFile = {stream: inFileStream}
  this.compiler(this, inFile, function(err, vFiles) {
    if (err) return callback(err)
    self.concatenator(self, vFiles, callback)
  })
}

exports.Processor.prototype.readFile = function(path) {
  return fs.createReadStream(path)
};
