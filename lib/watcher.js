'use strict'

var RSVP = require('rsvp')
var WatcherAdapter = require('./watcher_adapter')
var logger = require('heimdalljs-logger')('broccoli:watcher')

// This Watcher handles all the Broccoli logic, such as debouncing. The
// WatcherAdapter handles I/O via the sane package, and could be pluggable in
// principle.

module.exports = Watcher
function Watcher(builder, options) {
  this.options = options || {}
  if (this.options.debounce == null) this.options.debounce = 100
  this.builder = builder
  this.watcherAdapter = new WatcherAdapter(this.options.saneOptions)
  this.currentBuild = null
  this._rebuildScheduled = false
  this._ready = false
  this._quitting = false
  this._lifetimeDeferred = null
}

RSVP.EventTarget.mixin(Watcher.prototype)

Watcher.prototype.start = function() {
  var self = this

  if (this._lifetimeDeferred != null) throw new Error('Watcher.prototype.start() must not be called more than once')
  this._lifetimeDeferred = RSVP.defer()

  this.watcherAdapter.on('change', this._change.bind(this))
  this.watcherAdapter.on('error', this._error.bind(this))
  RSVP.resolve().then(function() {
    return self.watcherAdapter.watch(self.builder.watchedPaths)
  }).then(function() {
    logger.debug('ready')
    self._ready = true
    self.currentBuild = self._build()
  }).catch(function(err) {
    self._error(err)
  })

  return this._lifetimeDeferred.promise
}

Watcher.prototype._change = function() {
  var self = this

  if (!this._ready) {
    logger.debug('change', 'ignored: before ready')
    return
  }
  if (this._rebuildScheduled) {
    logger.debug('change', 'ignored: rebuild scheduled already')
    return
  }
  logger.debug('change')
  this._rebuildScheduled = true
  // Wait for current build, and ignore build failure
  RSVP.resolve(this.currentBuild).catch(function() { }).then(function() {
    if (self._quitting) return
    var buildPromise = new RSVP.Promise(function(resolve, reject) {
      logger.debug('debounce')
      self.trigger('debounce')
      setTimeout(resolve, self.options.debounce)
    }).then(function() {
      // Only set _rebuildScheduled to false *after* the setTimeout so that
      // change events during the setTimeout don't trigger a second rebuild
      self._rebuildScheduled = false
      return self._build()
    })
    self.currentBuild = buildPromise
  })
}

Watcher.prototype._build = function() {
  var self = this

  logger.debug('buildStart')
  this.trigger('buildStart')
  var buildPromise = self.builder.build()
  // Trigger change/error events. Importantly, if somebody else chains to
  // currentBuild, their callback will come after our events have
  // triggered, because we registered our callback first.
  buildPromise.then(function() {
    logger.debug('buildSuccess')
    self.trigger('buildSuccess')
  }, function(err) {
    logger.debug('buildFailure')
    self.trigger('buildFailure', err)
  })
  return buildPromise
}

Watcher.prototype._error = function(err) {
  var self = this

  logger.debug('error', err)
  if (this._quitting) return
  this._quit().catch(function() { }).then(function() {
    self._lifetimeDeferred.reject(err)
  })
}

Watcher.prototype.quit = function() {
  var self = this

  if (this._quitting) {
    logger.debug('quit', 'ignored: already quitting')
    return
  }
  this._quit().then(function() {
    self._lifetimeDeferred.resolve()
  }, function(err) {
    self._lifetimeDeferred.reject(err)
  })
}

Watcher.prototype._quit = function(err) {
  var self = this

  this._quitting = true
  logger.debug('quitStart')

  return RSVP.resolve().then(function() {
    return self.watcherAdapter.quit()
  }).finally(function() {
    // Wait for current build, and ignore build failure
    return RSVP.resolve(self.currentBuild).catch(function() { })
  }).finally(function() {
    logger.debug('quitEnd')
  })
}
