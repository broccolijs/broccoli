var fs = require('fs')
var path = require('path')
var async = require('async')
var mkdirp = require('mkdirp')
var jsStringEscape = require('js-string-escape')
var ES6Transpiler = require('es6-module-transpiler').Compiler

var transformers = require('../transformers')
var helpers = require('../helpers')


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


// The ES6ConcatenatorCompiler automatically includes modules referenced by
// import statements.
// To do: Add caching if necessary
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

  var inputPaths = helpers.multiGlob(this.inputPaths, {
    cwd: srcDir
  })
  for (var i = 0; i < inputPaths.length; i++) {
    var inputPath = inputPaths[i]
    try {
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

  var legacyFilePaths = helpers.multiGlob(this.legacyFilesToAppend, {
    cwd: srcDir
  })
  for (i = 0; i < legacyFilePaths.length; i++) {
    addLegacyFile(legacyFilePaths[i])
  }

  fs.writeFileSync(destDir + '/' + this.outputPath, output.join(''))
  callback()

  function addModule (moduleName) {
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
      addModule(imports[i])
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
  var paths = helpers.multiGlob(this.files, {
    cwd: srcDir,
    nomount: true
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
