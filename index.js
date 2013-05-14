var fs = require('fs')
var concat = require('concat-stream')
var through = require('through')
var async = require('async')
var jsStringEscape = require('js-string-escape')

exports.Processor = function(compiler, concatenator) {
  this.compiler = compiler
  this.concatenator = concatenator
}

exports.Processor.prototype.request = function(outFilePath, callback) {
  var self = this
  // We don't support path translation (different extensions) yet.
  var inFilePath = outFilePath
  this.compiler(this, inFilePath, function(err, vFiles) {
    if (err) return callback(err)
    self.concatenator(self, vFiles, callback)
  })
}

exports.Processor.prototype.inFileStream = function(inFilePath) {
  return fs.createReadStream(inFilePath, {encoding: 'utf8'})
};

exports.sourceUrlConcatenator = function(processor, vFiles, callback) {
  var outStream = through().pause()

  vFiles.forEach(function(vFile) {
    vFile.stream.pause()
  })

  // For each vFile sequentially, get the contents and write them into
  // outStream.
  async.eachSeries(vFiles, processVFile, finalize)

  function processVFile(vFile, callback) {
    vFile.stream.pipe(concat(function(err, vFileString) {
      if (err) return callback(err)
      var evalExpression = "eval('" +
        jsStringEscape(vFileString) +
        "//@ sourceURL=" + jsStringEscape(vFile.path) +
        "')\n"
      outStream.write(evalExpression)
      callback()
    }))
  }

  function finalize(err) {
    if (err) return callback(err)
    outStream.end()
    callback(null, {stream: outStream})
    outStream.resume()
  }
}
