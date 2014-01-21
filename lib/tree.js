var fs = require('fs')
var path = require('path')
var RSVP = require('rsvp')

var helpers = require('./helpers')
var component = require('./component')


exports.Tree = Tree
Tree.prototype = Object.create(component.Component.prototype)
Tree.prototype.constructor = Tree
function Tree (baseDirectory) {
  this.baseDirectory = baseDirectory
  this.transformers = []
  this._sources = []
}

Tree.prototype.map = function (src, dest) {
  helpers.assertAbsolutePaths([dest])
  this._sources.push([src, dest])
  return this
}

Tree.prototype.addTrees = function (trees) {
  this._sources = this._sources.concat(trees)
  this.addChildComponents(trees)
  return this
}

Tree.prototype.addBower = function () {
  this.addTrees(bowerTrees())
  return this
}

Tree.prototype.addTransformer = function (transformer) {
  this.transformers.push(transformer)
  this.addChildComponents([transformer])
  return this
}

Tree.prototype.toString = function () {
  return '[object Tree:' + this.baseDirectory + ']'
}

Tree.prototype.read = function (destDir) {
  var self = this
  if (this._sources.length === 0) throw new Error('No tree map for ' + this)
  var dir = this.transformers.length === 0 ? destDir : this.makeTmpDir()

  return readSources().then(applyTransformers)

  function readSources () {
    // We should have a separate target dir for each source and then link
    // them together, so that the sub-trees don't have to deal with (not)
    // overwriting files
    return self._sources.reduce(function (promise, sourceItem) {
      return promise.then(function () {
        if (Array.isArray(sourceItem)) { // mapping
          var src = sourceItem[0], dest = sourceItem[1]
          helpers.linkRecursivelySync(
            path.join(self.baseDirectory, src),
            path.join(dir, dest))
        } else { // sub-tree
          return sourceItem.read(dir)
        }
      })
    }, RSVP.resolve())
  }

  function applyTransformers () {
    return self.transformers.reduce(function (promise, transformer, index) {
      return promise.then(function () {
        var previousDir = dir
        dir = (index === self.transformers.length - 1) ? destDir : self.makeTmpDir()
        return transformer.transform(previousDir, dir)
      })
    }, RSVP.resolve())
  }
}

Tree.prototype.statsHash = function () {
  var self = this
  return helpers.hashStrings(this._sources.map(function (sourceItem) {
    if (Array.isArray(sourceItem)) { // mapping
      return helpers.hashTree(path.join(self.baseDirectory, sourceItem[0]))
    } else { // sub-tree
      return sourceItem.statsHash()
    }
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
