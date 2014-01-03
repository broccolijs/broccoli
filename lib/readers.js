var fs = require('fs')
var path = require('path')
var async = require('async')

var broccoli = require('./index')
var helpers = require('./helpers')
var component = require('./component')


exports.Reader = Reader
Reader.prototype = Object.create(component.Component.prototype)
Reader.prototype.constructor = Reader
function Reader () {}

Reader.prototype.read = function (destDir, callback) { throw new Error('not implemented') }

// This method is good for polling, but the interface will have to change once
// we implement inotify-based watching
Reader.prototype.statsHash = function () { throw new Error('not implemented') }


exports.TreeReader = TreeReader
TreeReader.prototype = Object.create(Reader.prototype)
TreeReader.prototype.constructor = TreeReader
function TreeReader () {
  this.trees = []
}

TreeReader.prototype.addTrees = function (trees) {
  this.trees = this.trees.concat(trees)
  return this
}

TreeReader.prototype.addBroccolifile = function (dir) {
  this.addTrees(Tree._fromDirectory(dir))
  return this
}

TreeReader.prototype.addBower = function () {
  this.addTrees(bowerTrees())
  return this
}

TreeReader.prototype.read = function (destDir, callback) {
  var self = this

  async.eachSeries(this.trees, function (pkg, pkgCallback) {
    if (pkg.transformer == null) {
      pkg.linkSourceTo(destDir)
      setImmediate(pkgCallback)
    } else {
      var intermediateDir = self.makeTmpDir()
      pkg.linkSourceTo(intermediateDir)
      pkg.transformer.setup(self._setupOptions)
      pkg.transformer.transform(intermediateDir, destDir, function (err) {
        setImmediate(function () {
          pkgCallback(err)
        })
      })
      // We should perhaps have a target dir and then link from there, so the
      // transformer doesn't have to support overwriting
    }
  }, function (err) {
    callback(err)
  })
}

TreeReader.prototype.statsHash = function () {
  return helpers.hashStrings(this.trees.map(function (pkg) {
    return pkg.statsHash()
  }))
}


exports.Tree = Tree
function Tree (baseDirectory, transformer, options) {
  this.baseDirectory = baseDirectory
  this.transformer = transformer
  this.options = options || {}
}

Tree.prototype.map = function (map) {
  var values = Object.keys(map).map(function (key) { return map[key] })
  helpers.assertAbsolutePaths(values)
  if (this._map != null) throw new Error('Multiple calls to .map not yet supported')
  this._map = map
  return this
}

Tree.prototype.addTransformer = function (transformer) {
  if (this.transformer != null) throw new Error('Multiple transformers not yet supported')
  this.transformer = transformer
  return this
}

Tree.prototype.linkSourceTo = function (destDir) {
  var self = this
  if (this._map == null) throw new Error('No tree map for ' + this.baseDirectory)
  Object.keys(this._map).forEach(function (key) {
    helpers.linkRecursivelySync(
      path.join(self.baseDirectory, key),
      path.join(destDir, self._map[key]))
  })
}

Tree.prototype.statsHash = function () {
  var self = this
  return helpers.hashStrings(Object.keys(this._map).map(function (relativePath) {
    return helpers.hashTree(path.join(self.baseDirectory, relativePath))
  }))
}

Tree._fromDirectory = function (dir) {
  var broccolifile = path.resolve(dir, 'Broccolifile.js')
  var trees = []
  if (fs.existsSync(broccolifile)) {
    var factory = {
      makeTree: function () {
        return new Tree(dir)
      }
    }
    trees = require(broccolifile)(factory, broccoli)
    if (!Array.isArray(trees)) throw new Error(broccolifile + ' must return an array of trees')
  } else {
    // Guess some reasonable defaults
    var options = bowerOptionsForDirectory(dir)
    var treeOptions = {}
    if (options.main != null) {
      var main = options.main
      if (typeof main === 'string') main = [main]
      if (!Array.isArray(main)) throw new Error(dir + ': Expected "main" bower option to be array or string')
      treeOptions.main = main
    }

    var map = {}
    // It's not clear that this is a sensible heuristic to hard-code here
    if (fs.existsSync(path.join(dir, 'lib'))) {
      map['lib'] = '/'
    }
    if (treeOptions.main) {
      for (var i = 0; i < treeOptions.main.length; i++) {
        map[treeOptions.main[i]] = '/' + path.basename(treeOptions.main[i])
      }
    } else {
      // Map repo root into namespace root. We should perhaps avoid this, as
      // it causes clutter.
      map[''] = '/'
    }

    var pkg = new Tree(dir, null, treeOptions).map(map)
    trees = [pkg]
  }

  return trees

  function bowerOptionsForDirectory (dir) {
    var options = {}
    ;['.bower.json', 'bower.json'].forEach(function (fileName) {
      var json
      try {
        json = fs.readFileSync(path.join(dir, fileName))
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


function bowerTrees () {
  var bowerDir = require('bower').config.directory // note: this relies on cwd
  if (bowerDir == null) throw new Error('Bower did not return a directory')
  var entries = fs.readdirSync(bowerDir)
  var directories = entries.filter(function (f) {
    return fs.statSync(path.join(bowerDir, f)).isDirectory()
  })
  var files = entries.filter(function (f) {
    var stat = fs.statSync(path.join(bowerDir, f))
    return stat.isFile() || stat.isSymbolicLink()
  })
  var trees = []
  for (var i = 0; i < directories.length; i++) {
    trees = trees.concat(Tree._fromDirectory(path.join(bowerDir, directories[i])))
  }
  // Pick up files as well; this is for compatibility with EAK's vendor/loader.js
  for (i = 0; i < files.length; i++) {
    var map = {}
    map['/' + files[i]] = '/' + files[i]
    trees.push(new Tree(bowerDir).map(map))
  }
  return trees
}
