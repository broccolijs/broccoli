var fs = require('fs')
var EventEmitter = require('events').EventEmitter
// how to configure compilers + concaters?

exports.Processor = function(compiler, concatenator) {
  this.compiler = compiler
  this.concatenator = concatenator
}

exports.Processor.prototype.request = function(inFilePath, callback) {
  var self = this
  this.compiler(this, inFilePath, function(err, vFiles) {
    if (err) return callback(err)
    self.concatenator(self, vFiles, callback)
  })
}

exports.Processor.prototype.inFileStream = function(inFilePath) {
  return fs.createReadStream(inFilePath)
};
