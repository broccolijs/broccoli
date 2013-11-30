var fs = require('fs')
var path = require('path')
var glob = require('glob')
var async = require('async')
var mkdirp = require('mkdirp')
var jsStringEscape = require('js-string-escape')

var transformers = require('../transformers')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.CompilerCollection = CompilerCollection
__extends(CompilerCollection, transformers.Transformer)
function CompilerCollection (compilers) {
  this.compilers = compilers
}

CompilerCollection.prototype.run = function (srcDir, destDir, callback) {
  async.eachSeries(this.compilers, function (compiler, callback) {
    compiler.run(srcDir, destDir, function (err) {
      process.nextTick(function () { // async to avoid long stack traces
        callback(err)
      })
    })
  }, function (err) {
    callback(err)
  })
}


exports.JavaScriptConcatenatorCompiler = JavaScriptConcatenatorCompiler
function JavaScriptConcatenatorCompiler (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

JavaScriptConcatenatorCompiler.prototype.run = function (srcDir, destDir, callback) {
  var self = this
  mkdirp.sync(destDir + '/' + path.dirname(this.outputPath))
  var writeStream = fs.createWriteStream(destDir + '/' + this.outputPath)

  for (var i = 0; i < this.files.length; i++) {
    var pattern = this.files[i]
    var matchingFiles = glob.sync(pattern, {
      cwd: srcDir,
      nomount: true,
      strict: true
    })
    if (matchingFiles.length === 0) {
      callback(new Error('Path or pattern "' + pattern + '" did not match any files'))
      return
    }
    for (var j = 0; j < matchingFiles.length; j++) {
      var relativePath = matchingFiles[j]
      var fullPath = srcDir + '/' + relativePath
      var fileContents = fs.readFileSync(fullPath).toString()
      if (!self.useSourceURL) {
        writeStream.write(fileContents + '\n')
      } else {
        // Should pull out copyright comment headers
        var evalExpression = 'eval("' +
          jsStringEscape(fileContents) +
          '//# sourceURL=' + jsStringEscape(relativePath) +
          '");\n'
        writeStream.write(evalExpression)
      }
    }
  }

  writeStream.end()
  callback()
}

JavaScriptConcatenatorCompiler.prototype.useSourceURL = true
JavaScriptConcatenatorCompiler.prototype.outputPath = 'app.js'


exports.StaticFileCompiler = StaticFileCompiler
function StaticFileCompiler (options) {
  this.files = []
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

StaticFileCompiler.prototype.run = function (srcDir, destDir, callback) {
  // Constructing globs like `{**/*.html,**/*.png}` should work reliably. If
  // not, we may need to switch to some multi-glob module.
  var combinedPattern = this.files.join(',')
  if (this.files.length > 1) {
    combinedPattern = '{' + combinedPattern + '}'
  }
  var paths = glob.sync(combinedPattern, {
    cwd: srcDir,
    nomount: true,
    strict: true
  })
  for (var i = 0; i < paths.length; i++) {
    var srcPath = srcDir + '/' + paths[i]
    var destPath = destDir + '/' + paths[i]
    var contents = fs.readFileSync(srcPath)
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, contents)
  }
  callback()
}
