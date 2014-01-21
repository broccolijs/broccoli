var RSVP = require('rsvp')

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
  this.addChildComponents([compiler])
  return this
}

CompilerCollection.prototype.transform = function (srcDir, destDir) {
  return this.compilers.reduce(function (promise, compiler) {
    return promise.then(function () {
      return compiler.compile(srcDir, destDir)
    })
  }, RSVP.resolve())
}


exports.Compiler = Compiler
Compiler.prototype = Object.create(Component.prototype)
Compiler.prototype.constructor = Compiler
function Compiler () {}
