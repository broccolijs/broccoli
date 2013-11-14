var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var glob = require('glob')
var jsStringEscape = require('js-string-escape')


exports.JavaScriptConcatenatorCompiler = JavaScriptConcatenatorCompiler
function JavaScriptConcatenatorCompiler (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

JavaScriptConcatenatorCompiler.prototype.run = function (src, dest, callback) {
  var self = this
  mkdirp.sync(dest + '/' + path.dirname(this.outputPath))
  var writeStream = fs.createWriteStream(dest + '/' + this.outputPath)

  for (var i = 0; i < this.files.length; i++) {
    var pattern = this.files[i]
    var matchingFiles = glob.sync(pattern, {
      cwd: src,
      nomount: true,
      strict: true
    })
    if (matchingFiles.length === 0) {
      callback(new Error('Path or pattern "' + pattern + '" did not match any files'))
      return
    }
    for (var j = 0; j < matchingFiles.length; j++) {
      var relativePath = matchingFiles[j]
      var fullPath = src + '/' + relativePath
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

StaticFileCompiler.prototype.run = function (src, dest, callback) {
  // Constructing globs like `{**/*.html,**/*.png}` should work reliably. If
  // not, we may need to switch to some multi-glob module.
  var combinedPattern = this.files.join(',')
  if (this.files.length > 1) {
    combinedPattern = '{' + combinedPattern + '}'
  }
  var paths = glob.sync(combinedPattern, {
    cwd: src,
    nomount: true,
    strict: true
  })
  for (var i = 0; i < paths.length; i++) {
    var srcPath = src + '/' + paths[i]
    var destPath = dest + '/' + paths[i]
    var contents = fs.readFileSync(srcPath)
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, contents)
  }
  callback()
}
