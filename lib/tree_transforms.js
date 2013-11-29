var fs = require('fs')
var path = require('path')
var async = require('async')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.TreeTransform = TreeTransform
function TreeTransform () {}


exports.CompilerCollection = CompilerCollection
__extends(CompilerCollection, TreeTransform)
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
