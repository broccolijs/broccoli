var fs = require('fs')
var path = require('path')
var async = require('async')

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

TreeReader.prototype.addBower = function () {
  this.addTrees(bowerTrees())
  return this
}

TreeReader.prototype.read = function (destDir, callback) {
  var self = this

  async.eachSeries(this.trees, function (tree, treeCallback) {
    if (tree.transformer == null) {
      tree.linkSourceTo(destDir)
      setImmediate(treeCallback)
    } else {
      var intermediateDir = self.makeTmpDir()
      tree.linkSourceTo(intermediateDir)
      tree.transformer.setup(self._setupOptions)
      tree.transformer.transform(intermediateDir, destDir, function (err) {
        setImmediate(function () {
          treeCallback(err)
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
  return helpers.hashStrings(this.trees.map(function (tree) {
    return tree.statsHash()
  }))
}


exports.Tree = Tree
function Tree (baseDirectory, transformer, options) {
  this.baseDirectory = baseDirectory
  this.transformer = transformer
  this.options = options || {}
}

Tree.prototype.map = function (src, dest) {
  helpers.assertAbsolutePaths([dest])
  if (this._map == null) this._map = []
  this._map.push([src, dest])
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
  this._map.forEach(function (srcAndDest) {
    helpers.linkRecursivelySync(
      path.join(self.baseDirectory, srcAndDest[0]),
      path.join(destDir, srcAndDest[1]))
  })
}

Tree.prototype.statsHash = function () {
  var self = this
  return helpers.hashStrings(this._map.map(function (srcAndDest) {
    return helpers.hashTree(path.join(self.baseDirectory, srcAndDest[0]))
  }))
}

Tree._fromDirectory = function (dir) {
  // Guess some reasonable defaults
  var options = bowerOptionsForDirectory(dir)
  var treeOptions = {}
  if (options.main != null) {
    var main = options.main
    if (typeof main === 'string') main = [main]
    if (!Array.isArray(main)) throw new Error(dir + ': Expected "main" bower option to be array or string')
    treeOptions.main = main
  }

  var tree = new Tree(dir, null, treeOptions)
  // It's not clear that this is a sensible heuristic to hard-code here
  if (fs.existsSync(path.join(dir, 'lib'))) {
    tree.map('lib', '/')
  }
  if (treeOptions.main) {
    for (var i = 0; i < treeOptions.main.length; i++) {
      tree.map(treeOptions.main[i], '/' + path.basename(treeOptions.main[i]))
    }
  } else {
    // Map repo root into namespace root. We should perhaps avoid this, as
    // it causes clutter.
    tree.map('', '/')
  }

  return [tree]

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
    trees.push(new Tree(bowerDir).map('/' + files[i], '/' + files[i]))
  }
  return trees
}


exports.makeFactory = makeFactory
function makeFactory (baseDir) {
  return {
    makeTree: function () {
      return new Tree(baseDir)
    }
  }
}
