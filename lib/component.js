var path = require('path')
var mktemp = require('mktemp')
var rimraf = require('rimraf')


exports.Component = Component
function Component () {}

// Called between instantiation and first run
Component.prototype.setup = function (options) {
  if (this._setupOptions != null) {
    throw new Error(this + ' already set up; did you insert it in more than one place?')
  }
  this._setupOptions = options
  this._setupChildComponents(this._childComponents || [])
}

// May be called when the component is destroyed
Component.prototype.teardown = function () {
  if (this._cacheDir != null) {
    rimraf.sync(this._cacheDir)
  }
  this._cacheDir = null
}

Component.prototype.addChildComponents = function (components) {
  this._childComponents = (this._childComponents || []).concat(components)
  if (this._setupOptions != null) this._setupChildComponents(components)
}

Component.prototype._setupChildComponents = function (components) {
  for (var i = 0; i < components.length; i++) {
    components[i].setup(this._setupOptions)
  }
}

Component.prototype.toString = function () {
  // Why is this not working by default in JavaScript?
  return '[object ' + (this.constructor && this.constructor.name || 'Object') + ']'
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
  var tmpDirName = (this.constructor.name.toLowerCase() || 'component') + '-XXXXXX.tmp'
  return mktemp.createDirSync(path.join(this._setupOptions.tmpDir, tmpDirName))
}
