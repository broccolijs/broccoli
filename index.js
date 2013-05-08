var EventEmitter = require('events').EventEmitter
// how to configure compilers + concaters?

exports.Processor = function(inputTree, compiler, concatenator) {
  this.inputTree = inputTree
  this.compiler = compiler
  this.concatenator = concatenator
}

exports.Processor.prototype.request = function(path) {
  vFileSequence = new EventEmitter
  var outStream = this.concatenator(this, vFileSequence)
  this.compiler(this, path, vFileSequence)
  return outStream;
}

exports.Processor.prototype.readFile = function(path) {
  return this.inputTree.readFile(path)
};
