var EventEmitter = require('events').EventEmitter

var helpers = require('broccoli-kitchen-sink-helpers')


module.exports = Watcher
function Watcher(builder) {
  this.builder = builder
  this.check()
}

Watcher.prototype = Object.create(EventEmitter.prototype)
Watcher.prototype.constructor = Watcher

Watcher.prototype.check = function() {
  try {
    var newStatsHash = this.builder.treesRead.map(function (tree) {
      return typeof tree === 'string' ? helpers.hashTree(tree) : ''
    }).join('\x00')
    if (newStatsHash !== this.statsHash) {
      this.statsHash = newStatsHash
      this.current = this.builder.build()
      this.current.then(function(directory) {
        this.emit('change', directory)
        return directory
      }.bind(this), function(error) {
        this.emit('error', error)
        throw error
      }.bind(this)).finally(this.check.bind(this))
    } else {
      setTimeout(this.check.bind(this), 100)
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
