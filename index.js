var fs = require('fs')
var EventEmitter = require('events').EventEmitter
// how to configure compilers + concaters?

exports.Processor = function(inputTree, compiler, concatenator) {
  this.inputTree = inputTree
  this.compiler = compiler
  this.concatenator = concatenator
}

exports.Processor.prototype.request = function(path, callback) {
  var self = this
  var inFileStream = fs.createReadStream(path)
  inFile = {stream: inFileStream}
  this.compiler(this, inFile, function(err, vFiles) {
    if (err) return callback(err)
    self.concatenator(self, vFiles, callback)
  })
}

exports.Processor.prototype.readFile = function(path) {
  return this.inputTree.readFile(path)
};
