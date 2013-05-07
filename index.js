// how to configure compilers + concaters?

exports.Processor = function(inputTree) {
  this.inputTree = inputTree;
};

exports.Processor.prototype.request = function(path, callback) {
  this.inputTree.readFile(path, callback)
};
