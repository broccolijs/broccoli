var fs = require('fs')
var path = require('path')
var glob = require('glob')
var jshashes = require('jshashes')
var findup = require('findup-sync')

var broccoli = require('./index')


exports.statsHash = statsHash
function statsHash (key, path, stats) {
  var keys = [
    key,
    path,
    stats.mode,
    stats.size,
    stats.mtime.getTime()
  ]
  var joinedKeys = keys.join('\n')
  var hash = new jshashes.SHA256().hex(joinedKeys)
  return hash
}

// Multi-glob with reasonable defaults, so APIs all behave the same
exports.multiGlob = multiGlob
function multiGlob (globs, globOptions) {
  var options = {
    nomount: true,
    strict: true
  }
  for (var key in globOptions) {
    if (globOptions.hasOwnProperty(key)) {
      options[key] = globOptions[key]
    }
  }

  var pathSet = {}
  var paths = []
  for (var i = 0; i < globs.length; i++) {
    if (options.nomount && globs[i][0] === '/') {
      throw new Error('Absolute paths not allowed (`nomount` is enabled): ' + globs[i])
    }
    var matches = glob.sync(globs[i], options)
    if (matches.length === 0) {
      throw new Error('Path or pattern "' + globs[i] + '" did not match any files')
    }
    for (var j = 0; j < matches.length; j++) {
      if (!pathSet[matches[j]]) {
        pathSet[matches[j]] = true
        paths.push(matches[j])
      }
    }
  }
  return paths
}


exports.loadStirfryfile = loadStirfryfile
function loadStirfryfile (findupOptions) {
  var stirfryfile = findup('Stirfryfile.js', findupOptions)
  if (stirfryfile == null) {
    throw new Error('Stirfryfile.js not found')
  }
  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function
  process.chdir(path.dirname(stirfryfile))
  return require(stirfryfile)(broccoli)
}


exports.loadBroccoliPackage = loadBroccoliPackage
function loadBroccoliPackage (packageDir) {
  var options = bowerOptionsForPackage(packageDir)
  var packageOptions = {}
  if (options.main != null) {
    var main = options.main
    if (typeof main === 'string') main = [main]
    if (!Array.isArray(main)) throw new Error(packageDir + ': Expected "main" bower option to be array or string')
    packageOptions.main = main
  }
  var pkg = new broccoli.readers.Package(packageDir, null, packageOptions)
  var broccolifile = path.resolve(packageDir, 'Broccolifile.js')
  if (fs.existsSync(broccolifile)) {
    // Run the package through Broccolifile.js so it can be modified
    require(broccolifile)(pkg, broccoli)
  }
  return pkg

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
