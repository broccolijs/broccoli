var fs = require('fs')
var mktemp = require('mktemp')
var async = require('async')
var mkdirp = require('mkdirp')
var broccoli = require('./index')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.Reader = Reader
__extends(Reader, broccoli.Component)
function Reader () {}


exports.PackageReader = PackageReader
__extends(PackageReader, Reader)
function PackageReader (packages) {
  this.packages = packages
}

PackageReader.prototype._setup = function (options) {
  this.setupOptions = options
}

PackageReader.prototype.read = function (destDir, callback) {
  var self = this

  async.eachSeries(this.packages, function (package, packageCallback) {
    var fullPathRelativePathTuples = package.getFullPathRelativePathTuples()
    if (package.transformer == null) {
      copyTuples(fullPathRelativePathTuples, destDir)
      packageCallback()
    } else {
      var intermediateDir = mktemp.createDirSync(self.getTmpDir() + '/package-reader-XXXXXX.tmp')
      copyTuples(fullPathRelativePathTuples, intermediateDir)
      package.transformer._setup(self.setupOptions)
      package.transformer.run(intermediateDir, destDir, function (err) {
        packageCallback(err)
      })
      // We should perhaps have a target dir and then link from there, so the
      // package's transformer doesn't have to support overwriting
    }
  }, function (err) {
    callback(err)
  })

  // This can probably be generalized somehow
  function copyTuples(fullPathRelativePathTuples, destDir) {
    for (var i = 0; i < fullPathRelativePathTuples.length; i++) {
      var fullPath = fullPathRelativePathTuples[i][0]
      var relativePath = fullPathRelativePathTuples[i][1]
      if (relativePath.slice(-1) === '/') {
        mkdirp.sync(destDir + '/' + relativePath)
      } else {
        var destPath = destDir + '/' + relativePath
        try {
          fs.linkSync(fullPath, destPath)
        } catch (err) {
          if (err.code !== 'EEXIST') throw err
          fs.unlinkSync(destPath)
          fs.linkSync(fullPath, destPath)
        }
      }
    }
  }
}

PackageReader.prototype.getPathsToWatch = function () {
  return [].concat.apply([], this.packages.map(function (package) {
    return package.getPathsToWatch()
  }))
}
