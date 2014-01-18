var fs = require('fs')
var path = require('path')
var RSVP = require('rsvp')

var helpers = require('./helpers')
var component = require('./component')


exports.Reader = Reader
Reader.prototype = Object.create(component.Component.prototype)
Reader.prototype.constructor = Reader
function Reader () {}

Reader.prototype.read = function (destDir) { throw new Error('not implemented') }

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
  this.addChildComponents(trees)
  return this
}

TreeReader.prototype.addBower = function () {
  this.addTrees(bowerTrees())
  return this
}

TreeReader.prototype.read = function (destDir) {
  return this.trees.reduce(function (promise, tree) {
    return promise.then(function () {
      // We should perhaps have a target dir and then link from there, so the
      // tree or its last transformer doesn't have to deal with overwriting
      return tree.read(destDir)
    })
  }, RSVP.resolve())
}

TreeReader.prototype.statsHash = function () {
  return helpers.hashStrings(this.trees.map(function (tree) {
    return tree.statsHash()
  }))
}

exports.Tree = Tree
Tree.prototype = Object.create(component.Component.prototype)
Tree.prototype.constructor = Tree
function Tree (baseDirectory) {
  this.baseDirectory = baseDirectory
  this.transformers = []
}

Tree.prototype.map = function (src, dest) {
  helpers.assertAbsolutePaths([dest])
  if (this._map == null) this._map = []
  this._map.push([src, dest])
  return this
}

Tree.prototype.addTransformer = function (transformer) {
  this.transformers.push(transformer)
  this.addChildComponents([transformer])
  return this
}

Tree.prototype.read = function (destDir) {
  var self = this
  if (this._map == null) throw new Error('No tree map for ' + this.baseDirectory)
  var dir = this.transformers.length === 0 ? destDir : this.makeTmpDir()
  this._map.forEach(function (srcAndDest) {
    // We might want to error out instead of silently overwriting here
    helpers.linkRecursivelySync(
      path.join(self.baseDirectory, srcAndDest[0]),
      path.join(dir, srcAndDest[1]))
  })
  return this.transformers.reduce(function (promise, transformer, index) {
    return promise.then(function () {
      var previousDir = dir
      dir = (index === self.transformers.length - 1) ? destDir : self.makeTmpDir()
      return transformer.transform(previousDir, dir)
    })
  }, RSVP.resolve())
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

  var tree = new Tree(dir)
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
