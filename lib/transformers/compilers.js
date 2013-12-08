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
function CompilerCollection (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

CompilerCollection.prototype.transform = function (srcDir, destDir, callback) {
  this.copyStaticFiles(srcDir, destDir, this.staticFiles)

  async.eachSeries(this.compilers, function (compiler, compilerCallback) {
    try {
      compiler.compile(srcDir, destDir, function (err) {
        process.nextTick(function () { // async to avoid long stack traces
          compilerCallback(err)
        })
      })
    } catch (err) {
      compilerCallback(err)
    }
  }, function (err) {
    callback(err)
  })
}

CompilerCollection.prototype.copyStaticFiles = function (srcDir, destDir, staticFiles) {
  var paths = helpers.multiGlob(staticFiles, {cwd: srcDir})
  for (var i = 0; i < paths.length; i++) {
    var srcPath = path.join(srcDir, paths[i])
    var destPath = path.join(destDir, paths[i])
    var contents = fs.readFileSync(srcPath)
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, contents)
  }
}


// The ES6ConcatenatorCompiler automatically includes modules referenced by
// import statements.
exports.ES6ConcatenatorCompiler = ES6ConcatenatorCompiler
function ES6ConcatenatorCompiler (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }

  this.cache = {}
}

ES6ConcatenatorCompiler.prototype.compile = function (srcDir, destDir, callback) {
  var self = this
  var modulesAdded = {}
  var output = []
  // When we are done compiling, we replace this.cache with newCache, so that
  // unused cache entries are garbage-collected
  var newCache = {}

  addLegacyFile(this.loaderFile)

  var inputFiles = helpers.multiGlob(this.inputFiles, {cwd: srcDir})
  for (var i = 0; i < inputFiles.length; i++) {
    var inputFile = inputFiles[i]
    if (inputFile.slice(-3) !== '.js') {
      throw new Error('ES6 file does not end in .js: ' + inputFile)
    }
    var moduleName = inputFile.slice(0, -3)
    addModule(moduleName)
  }

  var legacyFiles = helpers.multiGlob(this.legacyFilesToAppend, {cwd: srcDir})
  for (i = 0; i < legacyFiles.length; i++) {
    addLegacyFile(legacyFiles[i])
  }

  if (this.outputFile[0] === '/') {
    throw new Error('outputFile cannot be absolute: ' + this.outputFile)
  }
  mkdirp.sync(path.join(destDir, path.dirname(this.outputFile)))
  fs.writeFileSync(path.join(destDir, this.outputFile), output.join(''))

  self.cache = newCache
  callback()

  function addModule (moduleName) {
    if (modulesAdded[moduleName]) return
    if (self.ignoredModules.indexOf(moduleName) !== -1) return
    var i
    var modulePath = moduleName + '.js'
    var fullPath = path.join(srcDir, modulePath)
    var imports
    try {
      var statsHash = helpers.hashStats('es6Transpile', modulePath, fs.statSync(fullPath))
      var cacheObject = self.cache[statsHash]
      if (cacheObject == null) { // cache miss
        var fileContents = fs.readFileSync(fullPath).toString()
        var compiler = new ES6Transpiler(fileContents, moduleName)
        // Resolve relative imports by mutating the compiler's list of import nodes
        for (i = 0; i < compiler.imports.length; i++) {
          var importNode = compiler.imports[i]
          if ((importNode.type !== 'ImportDeclaration' &&
               importNode.type !== 'ModuleDeclaration') ||
            !importNode.source ||
            importNode.source.type !== 'Literal' ||
            !importNode.source.value) {
            throw new Error('Internal error: Esprima import node has unexpected structure')
          }
          // Mutate node
          if (importNode.source.value.slice(0, 1) === '.') {
            importNode.source.value = path.join(moduleName, '..', importNode.source.value)
          }
        }
        cacheObject = {
          output: wrapInEval(compiler.toAMD(), modulePath),
          imports: compiler.imports.map(function (importNode) {
            return importNode.source.value
          })
        }
      }
      newCache[statsHash] = cacheObject
      imports = cacheObject.imports
      output.push(cacheObject.output)
      modulesAdded[moduleName] = true
    } catch (err) {
      err.file = modulePath
      throw err
    }
    for (i = 0; i < imports.length; i++) {
      var importName = imports[i]
      addModule(importName)
    }
  }

  function addLegacyFile (filePath) {
    var fileContents = fs.readFileSync(path.join(srcDir, filePath)).toString()
    output.push(wrapInEval(fileContents, filePath))
  }
}


function wrapInEval (fileContents, fileName) {
  // Should pull out copyright comment headers
  // Eventually we want source maps instead of sourceURL
  return 'eval("' +
    jsStringEscape(fileContents) +
    '//# sourceURL=' + jsStringEscape(fileName) +
    '");\n'
}
