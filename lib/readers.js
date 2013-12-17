var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var async = require('async')

var broccoli = require('./index')
var helpers = require('./helpers')


exports.Reader = Reader
Reader.prototype = Object.create(broccoli.Component.prototype)
function Reader () {}

Reader.prototype._setup = function (options) {
  this.setupOptions = options
}

Reader.prototype.read = function (destDir, callback) { throw new Error('not implemented') }

// This method is good for polling, but the interface will have to change once
// we implement inotify-based watching
Reader.prototype.statsHash = function () { throw new Error('not implemented') }


exports.PackageReader = PackageReader
PackageReader.prototype = Object.create(Reader.prototype)
function PackageReader (packages) {
  this.packages = packages
}

PackageReader.prototype.read = function (destDir, callback) {
  var self = this

  async.eachSeries(this.packages, function (pkg, pkgCallback) {
    if (pkg.transformer == null) {
      pkg.linkSourceTo(destDir)
      setImmediate(pkgCallback)
    } else {
      var intermediateDir = mktemp.createDirSync(path.join(self.getTmpDir(), 'package-reader-XXXXXX.tmp'))
      pkg.linkSourceTo(intermediateDir)
      pkg.transformer._setup(self.setupOptions)
      pkg.transformer.transform(intermediateDir, destDir, function (err) {
        setImmediate(function () {
          pkgCallback(err)
        })
      })
      // We should perhaps have a target dir and then link from there, so the
      // package's transformer doesn't have to support overwriting
    }
  }, function (err) {
    callback(err)
  })
}

PackageReader.prototype.statsHash = function () {
  return helpers.hashStrings(this.packages.map(function (pkg) {
    return pkg.statsHash()
  }))
}


exports.Package = Package
function Package (baseDirectory, transformer, options) {
  this.baseDirectory = baseDirectory
  this.transformer = transformer
  this.options = options || {}
}

Package.prototype.map = function (map) {
  var values = Object.keys(map).map(function (key) { return map[key] })
  helpers.assertAbsolutePaths(values)
  this._map = map
  return this
}

Package.prototype.setTransformer = function (transformer) {
  this.transformer = transformer
  return this
}

Package.prototype.linkSourceTo = function (destDir) {
  var self = this
  if (this._map == null) throw new Error('No package map for ' + this.baseDirectory)
  Object.keys(this._map).forEach(function (key) {
    helpers.linkRecursivelySync(
      path.join(self.baseDirectory, key),
      path.join(destDir, self._map[key]))
  })
}

Package.prototype.statsHash = function () {
  var self = this
  return helpers.hashStrings(Object.keys(this._map).map(function (relativePath) {
    return helpers.hashTree(path.join(self.baseDirectory, relativePath))
  }))
}

Package.fromDirectory = function (packageDir) {
  var broccolifile = path.resolve(packageDir, 'Broccolifile.js')
  var packages = []
  if (fs.existsSync(broccolifile)) {
    var factory = {
      makePackage: function () {
        return new Package(packageDir)
      }
    }
    packages = require(broccolifile)(factory, broccoli)
    if (!Array.isArray(packages)) throw new Error(broccolifile + ' must return an array of packages')
  } else {
    // Guess some reasonable defaults for our package
    var options = bowerOptionsForPackage(packageDir)
    var packageOptions = {}
    if (options.main != null) {
      var main = options.main
      if (typeof main === 'string') main = [main]
      if (!Array.isArray(main)) throw new Error(packageDir + ': Expected "main" bower option to be array or string')
      packageOptions.main = main
    }

    var map = {}
    // It's not clear that this is a sensible heuristic to hard-code here
    if (fs.existsSync(path.join(packageDir, 'lib'))) {
      map['lib'] = '/'
    }
    if (packageOptions.main) {
      for (var i = 0; i < packageOptions.main.length; i++) {
        map[packageOptions.main[i]] = '/' + path.basename(packageOptions.main[i])
      }
    } else {
      // Map package root into namespace root. We should perhaps avoid this, as
      // it causes clutter.
      map[''] = '/'
    }

    var pkg = new Package(packageDir, null, packageOptions).map(map)
    packages = [pkg]
  }

  return packages

  function bowerOptionsForPackage(packageDir) {
    var options = {}
    ;['.bower.json', 'bower.json'].forEach(function (fileName) {
      var json
      try {
        json = fs.readFileSync(path.join(packageDir, fileName))
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
        return
      }
      var hash = JSON.parse(json) // should report file name on invalid JSON
      for (var key in hash) {
        if (hash.hasOwnProperty(key)) {
          options[key] = hash[key]
        }
      }
    })
    return options
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
  var entries = fs.readdirSync(bowerDir)
  var directories = entries.filter(function (f) {
    return fs.statSync(path.join(bowerDir, f)).isDirectory()
  })
  var files = entries.filter(function (f) {
    var stat = fs.statSync(path.join(bowerDir, f))
    return stat.isFile() || stat.isSymbolicLink()
  })
  var packages = []
  for (var i = 0; i < directories.length; i++) {
    packages = packages.concat(Package.fromDirectory(path.join(bowerDir, directories[i])))
  }
  // Pick up files as well; this is for compatibility with EAK's vendor/loader.js
  for (i = 0; i < files.length; i++) {
    var map = {}
    map['/' + files[i]] = '/' + files[i]
    packages.push(new Package(bowerDir).map(map))
  }
  return packages
}
