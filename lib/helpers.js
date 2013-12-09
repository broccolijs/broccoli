var fs = require('fs')
var path = require('path')
var glob = require('glob')
var crypto = require('crypto')
var findup = require('findup-sync')

var broccoli = require('./index')


exports.hashTree = hashTree
function hashTree (fullPath, _stack, _followSymlink) {
  // This function is used by the watcher. It makes the following guarantees:
  //
  // (1) It never throws an exception.
  //
  // (2) It does not miss changes. In other words, if after this function returns,
  // any part of the directory hierarchy changes, a subsequent call must
  // return a different hash.
  //
  // (1) and (2) hold even in the face of a constantly-changing file system.
  var stats
  try {
    if (_followSymlink) {
      stats = fs.statSync(fullPath)
    } else {
      stats = fs.lstatSync(fullPath)
    }
  } catch (err) {
    console.warn('Warning: failed to stat ' + fullPath)
    // fullPath has probably ceased to exist. Leave `stats` undefined and
    // proceed hashing.
  }
  var childrenHash = ''
  if (stats && stats.isDirectory()) {
    var fileIdentity = stats.dev + '\x00' + stats.ino
    if (_stack != null && _stack.indexOf(fileIdentity) !== -1) {
      console.warn('Symlink directory loop detected at ' + fullPath + ' (note: loop detection may have false positives on Windows)')
    } else {
      if (_stack != null) _stack = _stack.concat([fileIdentity])
      var entries
      try {
        entries = fs.readdirSync(fullPath)
      } catch (err) {
        console.warn('Failed to read directory ' + fullPath)
        childrenHash = 'readdir failed'
        // That's all there is to say about this directory.
      }
      if (entries != null) {
        childrenHash = hashStrings(entries.map(function (entry) {
          return hashTree(path.join(fullPath, entry), _stack)
        }))
      }
    }
  } else if (stats && stats.isSymbolicLink()) {
    if (_stack == null) {
      // From here on in the traversal, we need to guard against symlink
      // directory loops. _stack is kept null in the absence of symlinks to we
      // don't have to deal with Windows for now, as long as it doesn't use
      // symlinks.
      _stack = []
    }
    childrenHash = hashTree(fullPath, _stack, true) // follow symlink
  }
  // Perhaps we should not use basename to infer the file name
  return hashStrings([hashStats(stats, path.basename(fullPath)), childrenHash])
}


exports.hashStats = hashStats
function hashStats (stats, path) {
  // Both stats and path can be null
  var keys = []
  if (stats != null) {
    keys.push(stats.mode, stats.size, stats.mtime.getTime())
  }
  if (path != null) {
    keys.push(path)
  }
  return hashStrings(keys)
}


exports.hashStrings = hashStrings
function hashStrings (strings) {
  var joinedStrings = strings.join('\x00')
  return crypto.createHash('sha256').update(joinedStrings).digest('hex')
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
