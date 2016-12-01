var sane = require('sane')
var RSVP = require('rsvp')
var logger = require('heimdalljs-logger')('broccoli:watcherAdapter')


function defaultFilterFunction(name) {
  return /^[^\.]/.test(name)
}

module.exports = WatcherAdapter
RSVP.EventTarget.mixin(WatcherAdapter.prototype)
function WatcherAdapter(options) {
  this.options = options || {}
  this.options.filter = this.options.filter || defaultFilterFunction
}

WatcherAdapter.prototype.watch = function(watchedPaths) {
  var self = this

  this.watchers = []
  this.readyPromises = []
  watchedPaths.forEach(function(watchedPath) {
    var watcher = new sane(watchedPath, self.options)
    function bindFileEvent(event) {
      watcher.on(event, function(filepath, root, stat) {
        logger.debug(event, root + '/' + filepath)
        self.trigger('change')
      })
    }
    bindFileEvent('change')
    bindFileEvent('add')
    bindFileEvent('delete')
    watcher.on('error', function(err) {
      logger.debug('error', err)
      self.trigger('error', err)
    })
    var readyPromise = new RSVP.Promise(function(resolve, reject) {
      watcher.on('ready', function() {
        logger.debug('ready', watchedPath)
        resolve()
      })
    })
    self.watchers.push(watcher)
    self.readyPromises.push(readyPromise)
  })
  return RSVP.Promise.all(this.readyPromises)
}

WatcherAdapter.prototype.quit = function () {
  for (var i = 0; i < this.watchers.length; i++) {
    this.watchers[i].close()
  }
}
