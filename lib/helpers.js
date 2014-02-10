var fs = require('fs')
var path = require('path')
var glob = require('glob')
var crypto = require('crypto')
var findup = require('findup-sync')
var mkdirp = require('mkdirp')

var broccoli = require('./index')

// Warning: This module is not part of the "official" API. It will go away
// eventually.


exports.hashTree = hashTree
function hashTree (fullPath) {
  // This function is used by the watcher. It makes the following guarantees:
  //
  // (1) It never throws an exception.
  //
  // (2) It does not miss changes. In other words, if after this function returns,
  // any part of the directory hierarchy changes, a subsequent call must
  // return a different hash.
  //
  // (1) and (2) hold even in the face of a constantly-changing file system.
  return hashStrings(keysForTree(fullPath))
}

function keysForTree (fullPath, _stack, _followSymlink) {
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
  var childKeys = []
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
        console.warn('Warning: Failed to read directory ' + fullPath)
        console.warn(err.stack)
        childKeys = ['readdir failed']
        // That's all there is to say about this directory.
      }
      if (entries != null) {
        for (var i = 0; i < entries.length; i++) {
          childKeys = childKeys.concat(keysForTree(path.join(fullPath, entries[i]), _stack))
        }
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
    childKeys = keysForTree(fullPath, _stack, true) // follow symlink
  }
  // Perhaps we should not use basename to infer the file name
  return ['path', path.basename(fullPath)]
    .concat(stats ? ['stats', stats.mode, stats.size, stats.mtime.getTime()] : ['stat failed'])
    .concat(childKeys)
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


// If src is a file, dest is a file name. If src is a directory, dest is the
// directory that the contents of src will be copied into.
//
// This will overwrite dest if necessary. (This does not work when src is a
// file and dest is a directory.)
//
// This does not resolve symlinks. It is not clear whether it should.
//
// Note that unlike cp(1), we do not special-case if dest is an existing
// directory, because relying on things to exist when we're in the middle of
// assembling a new tree is too brittle.
exports.linkRecursivelySync = linkRecursivelySync
function linkRecursivelySync (src, dest, _mkdirp) {
  if (_mkdirp == null) _mkdirp = true
  // Note: We could try readdir'ing and catching ENOTDIR exceptions, but that
  // is 3x slower than stat'ing in the common case that we have a file.
  var srcStats = fs.statSync(src)
  if (srcStats.isDirectory()) {
    mkdirp.sync(dest)
    var entries = fs.readdirSync(src)
    for (var i = 0; i < entries.length; i++) {
      // Set _mkdirp to false when recursing to avoid extra mkdirp calls.
      linkRecursivelySync(src + '/' + entries[i], dest + '/' + entries[i], false)
    }
  } else {
    if (_mkdirp) {
      mkdirp.sync(path.dirname(dest))
    }
    linkAndOverwrite(src, dest)
  }
}


exports.linkAndOverwrite = linkAndOverwrite
function linkAndOverwrite (srcFile, destFile) {
  try {
    fs.linkSync(srcFile, destFile)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    fs.unlinkSync(destFile)
    fs.linkSync(srcFile, destFile)
  }
}


exports.assertAbsolutePaths = assertAbsolutePaths
function assertAbsolutePaths (paths) {
  for (var i = 0; i < paths.length; i++) {
    if (paths[i][0] !== '/') {
      throw new Error('Path must be absolute: "' + paths[i] + '"')
    }
  }
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

// `walkSync(baseDir)` is a faster substitute for
// glob.sync('**', {
//   cwd: baseDir,
//   dot: true,
//   mark: true,
//   strict: true
// })
//
// `baseDir` must not be ''; pass '.' instead
exports.walkSync = walkSync
function walkSync (baseDir, relativePath) {
  // Inside this function, prefer string concatenation to the slower path.join
  // https://github.com/joyent/node/pull/6929
  if (relativePath == null) {
    relativePath = ''
  } else if (relativePath.slice(-1) !== '/') {
    relativePath += '/'
  }

  var results = []
  var entries = fs.readdirSync(baseDir + '/' + relativePath)
  for (var i = 0; i < entries.length; i++) {
    var stats = fs.statSync(baseDir + '/' + relativePath + entries[i])
    if (stats.isDirectory()) {
      results.push(relativePath + entries[i] + '/')
      results = results.concat(walkSync(baseDir, relativePath + entries[i]))
    } else {
      results.push(relativePath + entries[i])
    }
  }
  return results
}


exports.loadBroccolifile = loadBroccolifile
function loadBroccolifile () {
  var broccolifile = findup('Broccolifile.js')
  if (broccolifile == null) {
    throw new Error('Broccolifile.js not found')
  }

  var baseDir = path.dirname(broccolifile)

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir)

  var tree = require(broccolifile)(broccoli)

  if (Array.isArray(tree)) {
    var MergedTree = require('./merged_tree').MergedTree
    tree = new MergedTree(tree)
  }
  return tree
}
