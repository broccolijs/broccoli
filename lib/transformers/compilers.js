var path = require('path')
var async = require('async')
var mkdirp = require('mkdirp')

var transformers = require('../transformers')
var helpers = require('../helpers')
var Component = require('../component').Component


exports.CompilerCollection = CompilerCollection
CompilerCollection.prototype = Object.create(transformers.Transformer.prototype)
CompilerCollection.prototype.constructor = CompilerCollection
function CompilerCollection () {
  this.compilers = []
}

CompilerCollection.prototype.addCompiler = function (compiler) {
  this.compilers.push(compiler)
  return this
}

CompilerCollection.prototype.transform = function (srcDir, destDir, callback) {
  async.eachSeries(this.compilers, function (compiler, compilerCallback) {
    try { // this should go away, or be a domain handler instead
      compiler.compile(srcDir, destDir, function (err) {
        setImmediate(function () { // async to avoid long stack traces
          compilerCallback(err)
        })
      })
    } catch (err) {
      err.message = compiler.constructor.name + ': ' + err.message
      compilerCallback(err)
    }
  }, function (err) {
    callback(err)
  })
}


exports.Compiler = Compiler
Compiler.prototype = Object.create(Component.prototype)
Compiler.prototype.constructor = Compiler
function Compiler () {}


exports.StaticFileCompiler = StaticFileCompiler
StaticFileCompiler.prototype = Object.create(Compiler.prototype)
StaticFileCompiler.prototype.constructor = StaticFileCompiler
function StaticFileCompiler (options) {
  this.options = options
}

StaticFileCompiler.prototype.compile = function (srcDir, destDir, callback) {
  if (this.options.files == null) {
    helpers.linkRecursivelySync(
      path.join(srcDir, this.options.srcDir),
      path.join(destDir, this.options.destDir))
  } else {
    var files = helpers.multiGlob(this.options.files, {
      cwd: path.join(srcDir, this.options.srcDir)
    })
    for (var i = 0; i < files.length; i++) {
      mkdirp.sync(path.join(destDir, this.options.destDir, path.dirname(files[i])))
      helpers.linkAndOverwrite(
        path.join(srcDir, this.options.srcDir, files[i]),
        path.join(destDir, this.options.destDir, files[i]))
    }
  }
  callback()
}
