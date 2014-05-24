var EventEmitter = require('events').EventEmitter

var helpers = require('broccoli-kitchen-sink-helpers')
var printSlowTrees = require('./logging').printSlowTrees


module.exports = Watcher
function Watcher(builder, options) {
  this.builder = builder
  this.options = options || {}
  this.watchedDirs = {}

  this.check()
}

Watcher.prototype = Object.create(EventEmitter.prototype)
Watcher.prototype.constructor = Watcher

Watcher.prototype.addWatchDir = function (path) {
  this.watchedDirs[path] = helpers.hashTree(path)
}

Watcher.prototype.detectChanges = function () {
  var changedDirs = [];

  for (var dir in this.watchedDirs) {
    if (this.watchedDirs.hasOwnProperty(dir)) {
      var currentHash = helpers.hashTree(dir)
      if (this.watchedDirs[dir] !== currentHash) {
        changedDirs.push(dir)
      }
    }
  }

  return changedDirs;
}

Watcher.prototype.check = function() {
  try {
    var interval = this.options.interval || 100
    var changedDirs = this.detectChanges();

    if (Object.keys(this.watchedDirs).length === 0 || changedDirs.length > 0) {
      this.watchedDirs = {}
      this.current = this.builder.build(this.addWatchDir.bind(this))
      this.current.then(function(hash) {
        if (this.options.verbose) {
          printSlowTrees(hash.graph, hash.nodes)
        }
        this.emit('change', hash)
      }.bind(this), function(error) {
        this.emit('error', error)
      }.bind(this)).finally(this.check.bind(this))
    } else {
      setTimeout(this.check.bind(this), interval)
    }
  } catch (err) {
    console.error('Uncaught error in Broccoli file watcher:')
    console.error(err.stack)
    console.error('Watcher quitting') // do not schedule check with setTimeout
  }
}

Watcher.prototype.then = function(success, fail) {
  return this.current.then(success, fail)
}
