var path = require('path')
var mktemp = require('mktemp')


exports.Component = Component
function Component () {}

// Called before each build
Component.prototype.setup = function (options) {
  if (this._setupOptions != null) {
    throw new Error(this + ' already set up. Did you insert it in more than one place? That is not (yet?) supported.')
  }
  this._setupOptions = options
  this._setupChildComponents(this._childComponents || [])
}

// Called after each build
Component.prototype.teardown = function () {
  this._setupOptions = null
  this._teardownChildComponents(this._childComponents || [])
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

Component.prototype._teardownChildComponents = function (components) {
  for (var i = 0; i < components.length; i++) {
    components[i].teardown()
  }
}

Component.prototype.toString = function () {
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
