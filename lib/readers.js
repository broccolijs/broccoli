var fs = require('fs')
var path = require('path')
var glob = require('glob')
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
      var intermediateDir = mktemp.createDirSync(path.join(self.getTmpDir(), 'package-reader-XXXXXX.tmp'))
      copyTuples(fullPathRelativePathTuples, intermediateDir)
      package.transformer._setup(self.setupOptions)
      package.transformer.transform(intermediateDir, destDir, function (err) {
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
      var destPath = path.join(destDir, relativePath)
      if (relativePath.slice(-1) === '/') {
        mkdirp.sync(destPath)
      } else {
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


exports.Package = Package
function Package (srcDir, transformer, options) {
  this.srcDir = srcDir
  this.transformer = transformer
  this.options = options || {}
}

Package.prototype.getFullPathRelativePathTuples = function () {
  var self = this

  if (this.options.main) {
    var fullPathRelativePathTuples = []
    for (var i = 0; i < this.options.main.length; i++) {
      var fullPath = path.join(this.srcDir, this.options.main[i])
      var relativePath = path.basename(this.options.main[i])
      fullPathRelativePathTuples.push([fullPath, relativePath])
    }
    return fullPathRelativePathTuples
  } else {
    var relativePaths = glob.sync('**', {
      cwd: this.srcDir,
      dot: true, // should we ignore .dotfiles?
      mark: true, // trailing slash for directories; requires additional stat calls
      strict: true
    })
    return relativePaths.map(function (relativePath) {
      return [path.join(self.srcDir, relativePath), relativePath]
    })
  }
}

Package.prototype.getPathsToWatch = function () {
  var self = this

  if (this.options.main) {
    return this.options.main.map(function (filePath) {
      // This watches too much, but the watch package doesn't support watching files
      return path.dirname(path.join(self.srcDir, filePath))
    })
  } else {
    return this.srcDir
  }
}


exports.bowerPackages = bowerPackages
function bowerPackages (bowerDir, packageOptions) {
  if (typeof bowerDir !== 'string' && packageOptions == null) {
    // bowerDir is optional
    packageOptions = bowerDir
    bowerDir = null
  }
  if (bowerDir == null) {
    bowerDir = 'bower_components'
  }
  var files = fs.readdirSync(bowerDir)
  var directories = files.filter(function (f) { return fs.statSync(path.join(bowerDir, f)).isDirectory() })
  var packages = []
  for (var i = 0; i < directories.length; i++) {
    var srcDir = path.join(bowerDir, directories[i])
    var options = bowerOptionsForPackage(directories[i])
    if (options.assetDirs != null) {
      // We should handle the exclusion of assetDirs and main more gracefully
      for (var j = 0; j < options.assetDirs.length; j++) {
        packages.push(new Package(path.join(srcDir, options.assetDirs[j])))
      }
    } else {
      packageOptions = {}
      if (options.main != null) {
        var main = options.main
        if (typeof main === 'string') main = [main]
        if (!Array.isArray(main)) throw new Error(directories[i] + ': Expected "main" bower option to be array or string')
        packageOptions.main = main
      }
      packages.push(new Package(srcDir, null, packageOptions))
    }
  }
  return packages

  function bowerOptionsForPackage(packageDir) {
    var options = {}
    var hashes = []
    ;['.bower.json', 'bower.json'].forEach(function (fileName) {
      var json
      try {
        json = fs.readFileSync(path.join(bowerDir, packageDir, fileName))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
        return
      }
      hashes.push(JSON.parse(json)) // should report file name on invalid JSON
    })
    hashes.push((packageOptions || {})[packageDir] || {})
    for (var i = 0; i < hashes.length; i++) {
      for (var key in hashes[i]) {
        if (hashes[i].hasOwnProperty(key)) {
          options[key] = hashes[i][key]
        }
      }
    }
    return options
  }
}
