var fs = require('fs')
var path = require('path')
var quickTemp = require('quick-temp')

var helpers = require('./helpers')


exports.Tree = Tree
function Tree (baseDirectory) {
  this.baseDirectory = baseDirectory
  this._mappings = []
}

Tree.prototype.map = function (src, dest) {
  helpers.assertAbsolutePaths([dest])
  this._mappings.push([src, dest])
  return this
}

Tree.prototype.toString = function () {
  return '[object Tree:' + this.baseDirectory + ']'
}

Tree.prototype.read = function (readTree) {
  quickTemp.makeOrRemake(this, '_tmpDestDir')

  if (this._mappings.length === 0) throw new Error('No tree map for ' + this)

  for (var i = 0; i < this._mappings.length; i++) {
    var src = this._mappings[i][0], dest = this._mappings[i][1]
    // We should not overwrite
    helpers.linkRecursivelySync(
      path.join(this.baseDirectory, src),
      path.join(this._tmpDestDir, dest))
  }

  return this._tmpDestDir
}

Tree.prototype.cleanup = function () {
  quickTemp.remove(this, '_tmpDestDir')
}

Tree.prototype.statsHash = function () {
  var self = this
  return helpers.hashStrings(this._mappings.map(function (mapping) {
    return helpers.hashTree(path.join(self.baseDirectory, mapping[0]))
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


// This is exposed as API, but needs refactoring and will likely change
exports.bowerTrees = bowerTrees
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
