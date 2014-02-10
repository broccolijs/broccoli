var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var RSVP = require('rsvp')
var quickTemp = require('quick-temp')

var Transformer = require('../transformers').Transformer
var helpers = require('../helpers')


exports.Filter = Filter
Filter.prototype = Object.create(Transformer.prototype)
Filter.prototype.constructor = Filter
function Filter (inputTree) {
  this.inputTree = inputTree
}

Filter.prototype.getCacheDir = function () {
  return quickTemp.makeOrReuse(this, '_tmpCacheDir')
}

Filter.prototype.transform = function (srcDir, destDir) {
  var self = this

  var paths = helpers.walkSync(srcDir)

  return paths.reduce(function (promise, relativePath) {
    return promise.then(function () {
      if (relativePath.slice(-1) === '/') {
        mkdirp.sync(destDir + '/' + relativePath)
      } else {
        if (self.canProcessFile(relativePath)) {
          return self.processAndCacheFile(srcDir, destDir, relativePath)
        } else {
          fs.linkSync(srcDir + '/' + relativePath, destDir + '/' + relativePath)
        }
      }
    })
  }, RSVP.resolve())
}

Filter.prototype.cleanup = function () {
  quickTemp.remove(this, '_tmpCacheDir')
  Transformer.prototype.cleanup.call(this)
}

Filter.prototype.canProcessFile = function (relativePath) {
  return this.getDestFilePath(relativePath) != null
}

Filter.prototype.getDestFilePath = function (relativePath) {
  for (var i = 0; i < this.extensions.length; i++) {
    var ext = this.extensions[i]
    if (relativePath.slice(-ext.length - 1) === '.' + ext) {
      if (this.targetExtension != null) {
        relativePath = relativePath.slice(0, -ext.length) + this.targetExtension
      }
      return relativePath
    }
  }
  return null
}

Filter.prototype.processAndCacheFile = function (srcDir, destDir, relativePath) {
  var self = this

  this._cache = this._cache || {}
  this._cacheIndex = this._cacheIndex || 0
  var cacheEntry = this._cache[relativePath]
  if (cacheEntry != null && cacheEntry.hash === hash(cacheEntry.inputFiles)) {
    linkFromCache(cacheEntry)
  } else {
    return RSVP.Promise.cast(self.processFile(srcDir, destDir, relativePath))
      .then(function (cacheInfo) {
        linkToCache(cacheInfo)
      })
  }

  function hash (filePaths) {
    return filePaths.map(function (filePath) {
      return helpers.hashTree(srcDir + '/' + filePath)
    }).join(',')
  }

  function linkFromCache (cacheEntry) {
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var dest = destDir + '/' + cacheEntry.outputFiles[i]
      mkdirp.sync(path.dirname(dest))
      fs.linkSync(self.getCacheDir() + '/' + cacheEntry.cacheFiles[i], dest)
    }
  }

  function linkToCache (cacheInfo) {
    var cacheEntry = {
      inputFiles: (cacheInfo || {}).inputFiles || [relativePath],
      outputFiles: (cacheInfo || {}).outputFiles || [self.getDestFilePath(relativePath)],
      cacheFiles: []
    }
    for (var i = 0; i < cacheEntry.outputFiles.length; i++) {
      var cacheFile = (self._cacheIndex++) + ''
      cacheEntry.cacheFiles.push(cacheFile)
      fs.linkSync(
        destDir + '/' + cacheEntry.outputFiles[i],
        self.getCacheDir() + '/' + cacheFile)
    }
    cacheEntry.hash = hash(cacheEntry.inputFiles)
    self._cache[relativePath] = cacheEntry
  }
}

Filter.prototype.processFile = function (srcDir, destDir, relativePath) {
  var self = this
  var string = fs.readFileSync(srcDir + '/' + relativePath, { encoding: 'utf8' })
  return RSVP.Promise.cast(self.processString(string))
    .then(function (outputString) {
      var outputPath = self.getDestFilePath(relativePath)
      fs.writeFileSync(destDir + '/' + outputPath, outputString, { encoding: 'utf8' })
    })
}
