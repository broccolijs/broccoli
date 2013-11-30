var fs = require('fs')
var path = require('path')
var glob = require('glob')

exports.Package = Package
function Package (srcDir, treeTransform, options) {
  this.srcDir = srcDir
  this.treeTransform = treeTransform
  this.options = options || {}
}

Package.prototype.getFullPathRelativePathTuples = function () {
  var self = this

  if (this.options.main) {
    var fullPathRelativePathTuples = []
    for (var i = 0; i < this.options.main.length; i++) {
      var fullPath = this.srcDir + '/' + this.options.main[i]
      var relativePath = path.basename(this.options.main[i])
      fullPathRelativePathTuples.push([fullPath, relativePath])
    }
    return fullPathRelativePathTuples
  } else {
    var paths = glob.sync('**', {
      cwd: this.srcDir,
      dot: true, // should we ignore .dotfiles?
      mark: true, // trailing slash for directories; requires additional stat calls
      strict: true
    })
    return paths.map(function (path) {
      return [self.srcDir + '/' + path, path]
    })
  }
}

Package.prototype.getPathsToWatch = function () {
  var self = this

  if (this.options.main) {
    return this.options.main.map(function (filePath) {
      // This watches too much, but the watch package doesn't support watching files
      return path.dirname(self.srcDir + '/' + filePath)
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
  var directories = files.filter(function (f) { return fs.statSync(bowerDir + '/' + f).isDirectory() })
  var packages = []
  for (var i = 0; i < directories.length; i++) {
    var srcDir = bowerDir + '/' + directories[i]
    var options = bowerOptionsForPackage(directories[i])
    if (options.assetDirs != null) {
      // We should handle the exclusion of assetDirs and main more gracefully
      for (var j = 0; j < options.assetDirs.length; j++) {
        packages.push(new Package(srcDir + '/' + options.assetDirs[j]))
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
        json = fs.readFileSync(bowerDir + '/' + packageDir + '/' + fileName)
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
