var fs = require('fs')

exports.Package = Package
function Package (srcDir) {
  this.srcDir = srcDir
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
    var options = (packageOptions || {})[directories[i]] || {}
    if (options.assetDirs != null) {
      for (var j = 0; j < options.assetDirs.length; j++) {
        packages.push(new Package(srcDir + '/' + options.assetDirs[j]))
      }
    } else {
      packages.push(new Package(srcDir))
    }
  }
  return packages
}
