var EventEmitter = require('events').EventEmitter

var RSVP    = require('rsvp');
var Promise = RSVP.Promise;
var helpers = require('broccoli-kitchen-sink-helpers')
var printSlowTrees = require('broccoli-slow-trees');


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
      Promise.resolve()
        .then(function () {
          if (this.options.willBuild) {
            return this.options.willBuild(changedDirs)
          }
        }.bind(this))
        .then(function () {
          this.current = this.builder.build(this.addWatchDir.bind(this))
          this.current
          .then(function (hash) {
            return Promise.resolve()
              .then(function() {
                if (this.options.didBuild) this.options.didBuild(hash)
              }.bind(this))
              .then(function() { return hash; });
          }.bind(this))
          .then(function (hash) {
            if (this.options.verbose) printSlowTrees(hash.graph)

            this.emit('change', hash)
          }.bind(this))
          .catch(function(error) {
            if (this.options.didError) this.options.didError(error)

            this.emit('error', error)
          }.bind(this))
          .finally(this.check.bind(this))
        }.bind(this))
        .catch(RSVP.rethrow)
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
