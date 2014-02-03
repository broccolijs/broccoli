var path = require('path')
var mktemp = require('mktemp')

exports.CacheManager = CacheManager
function CacheManager (baseDir) {
  // When baseDir is given, the CacheManager will not currently clean up after
  // itself
  if (baseDir == null) {
    var temp = require('temp')
    temp.track()
    baseDir = temp.mkdirSync({
      prefix: '.broccoli-cache-',
      suffix: '.tmp',
      dir: process.cwd()
    })
  }
  this._baseDir = baseDir
}

CacheManager.prototype.getCacheDir = function (instance) {
  if (instance._cacheDir == null) {
    var instanceName = (instance && instance.constructor && instance.constructor.name) || 'object'
    var cacheDirName = instanceName.toLowerCase() + '-cache-XXXXXX.tmp'
    instance._cacheDir = mktemp.createDirSync(path.join(this._baseDir, cacheDirName))
  }
  return instance._cacheDir
}
