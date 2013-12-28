var async = require('async')

var transformers = require('../transformers')
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
