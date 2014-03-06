var EventEmitter = require('events').EventEmitter

module.exports = Watcher
function Watcher(builder) {
  this.builder = builder
  this.check()
}

Watcher.prototype = Object.create(EventEmitter.prototype)
Watcher.prototype.constructor = Watcher

Watcher.prototype.check = function() {
  var newStatsHash = this.builder.treesRead.map(function (tree) {
    return tree.statsHash != null ? tree.statsHash() : ''
  }).join('\x00')
  if (newStatsHash !== this.statsHash) {
    this.statsHash = newStatsHash
    this.current = this.builder.build()
    this.current.then(function(directory) {
      this.emit('change', directory)
    }.bind(this), function(error) {
      this.emit('error', error)
    }.bind(this))
  }
  setTimeout(this.check.bind(this), 100)
}

Watcher.prototype.then = function(success, fail) {
  this.current.then(success, fail)
}
