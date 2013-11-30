var mktemp = require('mktemp')
var rimraf = require('rimraf')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.Component = Component
function Component () {}

Component.prototype._setup = function (options) {
  this.setupOptions = options
}

Component.prototype.getCacheDir = function () {
  if (this.cacheDir == null) {
    this.cacheDir = mktemp.createDirSync(this.setupOptions.cacheDir + '/tree-transform-XXXXXX.tmp')
  }
  return this.cacheDir
}

Component.prototype.removeCacheDir = function () {
  if (this.cacheDir != null) {
    rimraf.sync(this.cacheDir)
  }
  this.cacheDir = null
}

Component.prototype.getTmpDir = function () {
  return this.setupOptions.tmpDir
}
