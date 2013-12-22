var path = require('path')
var mktemp = require('mktemp')
var rimraf = require('rimraf')


exports.Component = Component
function Component () {}

// Called between instantiation and first run
Component.prototype.setup = function (options) {
  this._setupOptions = options
}

// May be called when the component is destroyed
Component.prototype.teardown = function () {
  if (this._cacheDir != null) {
    rimraf.sync(this._cacheDir)
  }
  this._cacheDir = null
}

// Called after each build
Component.prototype.cleanup = function () {
  if (this._tmpDir != null) {
    rimraf.sync(this._tmpDir)
  }
  this._tmpDir = null
}

// Get the per-instance cache directory for this component
Component.prototype.getCacheDir = function () {
  if (this._cacheDir == null) {
    var cacheDirName = (this.constructor.name.toLowerCase() || 'component') + '-cache-XXXXXX.tmp'
    this._cacheDir = mktemp.createDirSync(path.join(this._setupOptions.cacheDir, cacheDirName))
  }
  return this._cacheDir
}

// Make a new temporary directory, which will be removed when the build has
// finished
Component.prototype.makeTmpDir = function () {
  if (this._tmpDir == null) {
    var tmpDirName = (this.constructor.name.toLowerCase() || 'component') + '-XXXXXX.tmp'
    this._tmpDir = mktemp.createDirSync(path.join(this._setupOptions.tmpDir, tmpDirName))
  }
  return this._tmpDir
}
