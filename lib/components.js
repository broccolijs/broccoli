var mktemp = require('mktemp')
var rimraf = require('rimraf')


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
