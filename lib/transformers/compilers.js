var fs = require('fs')
var path = require('path')
var glob = require('glob')
var async = require('async')
var mkdirp = require('mkdirp')
var jsStringEscape = require('js-string-escape')
var ES6Transpiler = require('es6-module-transpiler').Compiler

var transformers = require('../transformers')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.CompilerCollection = CompilerCollection
__extends(CompilerCollection, transformers.Transformer)
function CompilerCollection (compilers) {
  this.compilers = compilers
}

CompilerCollection.prototype.transform = function (srcDir, destDir, callback) {
  async.eachSeries(this.compilers, function (compiler, compilerCallback) {
    compiler.compile(srcDir, destDir, function (err) {
      process.nextTick(function () { // async to avoid long stack traces
        compilerCallback(err)
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

JavaScriptConcatenatorCompiler.prototype.compile = function (srcDir, destDir, callback) {
  var self = this
  mkdirp.sync(destDir + '/' + path.dirname(this.outputPath))
  var output = []

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
        output.push(';\n' + fileContents + '\n')
      } else {
        output.push(wrapInEval(fileContents, relativePath))
      }
    }
  }

  fs.writeFileSync(destDir + '/' + this.outputPath, output.join(''))
  callback()
}

JavaScriptConcatenatorCompiler.prototype.useSourceURL = true
JavaScriptConcatenatorCompiler.prototype.outputPath = 'app.js'


// The ES6ConcatenatorCompiler automatically includes modules referenced by
// import statements.
// To do: Add caching if necessary.
exports.ES6ConcatenatorCompiler = ES6ConcatenatorCompiler
function ES6ConcatenatorCompiler (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

ES6ConcatenatorCompiler.prototype.compile = function (srcDir, destDir, callback) {
  var self = this
  var modulesAdded = {}
  var output = []

  addLegacyFile(this.loaderPath)

  // To do: Extract expand-array-with-glob functionality into helper function
  for (var i = 0; i < this.inputPaths.length; i++) {
    var pattern = this.inputPaths[i]
    var matches = glob.sync(pattern, {
      cwd: srcDir,
      dot: true,
      strict: true
    })
    for (var j = 0; j < matches.length; j++) {
      try {
        var inputPath = matches[j]
        if (inputPath.slice(-3) !== '.js') {
          throw new Error('ES6 file does not end in .js: ' + inputPath)
        }
        var moduleName = inputPath.slice(0, -3)
        addModule(moduleName)
      } catch (err) { // we should not have to catch here; invoker should catch
        callback(err)
        return
      }
    }
  }
  for (i = 0; i < this.legacyFilesToAppend.length; i++) {
    addLegacyFile(this.legacyFilesToAppend[i])
  }
  fs.writeFileSync(destDir + '/' + this.outputPath, output.join(''))
  callback()

  function addModule (moduleName) {
    console.error(moduleName)
    if (modulesAdded[moduleName]) return
    if (self.ignoredModules.indexOf(moduleName) !== -1) return
    var modulePath = moduleName + '.js'
    var fileContents = fs.readFileSync(srcDir + '/' + modulePath).toString()
    var compiler = new ES6Transpiler(fileContents, moduleName)
    output.push(wrapInEval(compiler.toAMD(), modulePath))
    modulesAdded[moduleName] = true

    var imports = compiler.imports.map(function (importNode) {
      if (importNode.type !== 'ImportDeclaration' ||
        importNode.source.type !== 'Literal' ||
        !importNode.source.value) {
        throw new Error('Internal error: Esprima import node has unexpected structure')
      }
      return importNode.source.value
    })

    for (var i = 0; i < imports.length; i++) {
      if (self.ignoredModules.indexOf(imports[i]) === -1) {
        addModule(imports[i])
      }
    }
  }

  function addLegacyFile (filePath) {
    var fileContents = fs.readFileSync(srcDir + '/' + filePath).toString()
    output.push(wrapInEval(fileContents, filePath))
  }
}


exports.StaticFileCompiler = StaticFileCompiler
function StaticFileCompiler (options) {
  this.files = []
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

StaticFileCompiler.prototype.compile = function (srcDir, destDir, callback) {
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


function wrapInEval (fileContents, fileName) {
  // Should pull out copyright comment headers
  // Eventually we want source maps instead of sourceURL
  return 'eval("' +
    jsStringEscape(fileContents) +
    '//# sourceURL=' + jsStringEscape(fileName) +
    '");\n'
}
