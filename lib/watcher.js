var EventEmitter = require('events').EventEmitter

var broccoli = require('./index')
var helpers = require('broccoli-kitchen-sink-helpers')


module.exports = Watcher
function Watcher(tree, options) {
  this.tree    = tree    || broccoli.loadBrocfile()
  this.options = options || {}
  this.builder = new broccoli.Builder()
  this.setupExitHooks()
  this.check()
}

Watcher.prototype = Object.create(EventEmitter.prototype)
Watcher.prototype.constructor = Watcher

Watcher.prototype.check = function() {
  try {
    var interval = this.options.interval || 100
    var newStatsHash = this.builder.treesRead.map(function (tree) {
      return typeof tree === 'string' ? helpers.hashTree(tree) : ''
    }).join('\x00')
    if (newStatsHash !== this.statsHash) {
      this.statsHash = newStatsHash
      this.current = this.builder.build(this.tree)
      this.current.then(function(directory) {
        this.emit('change', directory)
        return directory
      }.bind(this), function(error) {
        this.emit('error', error)
        throw error
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

Watcher.prototype.setupExitHooks = function setupExitHooks() {
  process.addListener('exit', function () {
    this.builder.cleanup()
  })

  // We register these so the 'exit' handler removing temp dirs is called
  process.on('SIGINT', function () {
    process.exit(1)
  })
  process.on('SIGTERM', function () {
    process.exit(1)
  })
}
