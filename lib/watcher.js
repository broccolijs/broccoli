var EventEmitter = require('events').EventEmitter
var printSlowTrees = require('./logging').printSlowTrees
var chokidar = require('chokidar')


module.exports = Watcher
function Watcher(builder, options) {
  this.builder = builder
  this.options = options || {}
  this.watchedDirs = []

  this.chokidarWatcher = new chokidar.FSWatcher({
    persistent: false,
    ignoreInitial: true
  })

  this.check()
}

Watcher.prototype = Object.create(EventEmitter.prototype)
Watcher.prototype.constructor = Watcher

Watcher.prototype.addWatchDir = function (path) {
  this.watchedDirs.push(path)
}

function _treeChanged(){
  this.current.then(function(hash) {
    if (this.options.verbose) { printSlowTrees(hash.graph) }
    this.emit('change', hash)
  }.bind(this), function(error) {
    this.emit('error', error)
  }.bind(this))
}

Watcher.prototype.check = function() {
  this.watchedDirs = []
  this.current = this.builder.build(this.addWatchDir.bind(this))

  this.current.then(function() {
    _treeChanged.call(this)

    this.chokidarWatcher.close() // removes any open filewatchers
    this.chokidarWatcher.add(this.watchedDirs)

    this.chokidarWatcher.on('all', function(event, path) {
      this.current = this.builder.build(this.addWatchDir.bind(this))
      _treeChanged.call(this)
    }.bind(this))

  }.bind(this))
}

Watcher.prototype.then = function(success, fail) {
  return this.current.then(success, fail)
}
