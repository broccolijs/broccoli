var fs = require('fs')

exports.Package = Package
function Package (srcDir, options) {
  this.srcDir = srcDir
  this.options = options || {}
  this.preprocessors = []
}

Package.prototype.registerPreprocessor = function (preprocessor) {
  this.preprocessors.push(preprocessor)
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
      packages.push(new Package(srcDir, packageOptions))
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
