'use strict'

var RSVP = require('rsvp')

var helpers = require('broccoli-kitchen-sink-helpers')


module.exports = Watcher
function Watcher(builder, options) {
  this.builder = builder
  this.options = options || {}
  this.treeHashes = []
  this.quitting = false
  this.initialBuildStarted = false
  this.watchDeferred = null
}

RSVP.EventTarget.mixin(Watcher.prototype)

Watcher.prototype.watch = function() {
  var self = this

  if (this.watchDeferred != null) throw new Error('watcher.watch() must only be called once')
  this.watchDeferred = RSVP.defer()
  self.check()
  return this.watchDeferred.promise
}

Watcher.prototype.detectChanges = function () {
  var changedPaths = []

  for (var i = 0; i < this.builder.watchedPaths.length; i++) {
    var hash = helpers.hashTree(this.builder.watchedPaths[i])
    if (hash !== this.treeHashes[i]) {
      changedPaths.push(this.builder.watchedPaths[i])
      this.treeHashes[i] = hash
    }
  }

  return changedPaths
}

Watcher.prototype.check = function() {
  var self = this

  this.timeoutID = null

  // .check can be scheduled via setTimeout or via .then, so we cannot
  // just rely on clearTimeout for quitting
  if (this.quitting) {
    return
  }

  try {
    var changedPaths = this.detectChanges()

    if (changedPaths.length > 0 || !this.initialBuildStarted) {
      this.initialBuildStarted = true
      this.trigger('build')
      this.currentBuild = this.builder.build()
      this.currentBuild
        // Trigger change/error events. If somebody else chains to
        // currentBuild, their callback will come after our events have
        // triggered, because we registered our callback first. This is subtle
        // but important.
        .then(function() {
          self.trigger('change')
        }, function(err) {
          self.trigger('error', err)
          // Do not rethrow
        })
        .then(function() {
          // Resume watching
          self.check()
        }, function(err) {
          // A 'change' or 'error' event handler threw an error
          self.watchDeferred.reject(err)
        })
    } else {
      // Schedule next check in 100 milliseconds
      var interval = this.options.interval || 100
      this.timeoutID = setTimeout(this.check.bind(this), interval)
    }
  } catch (err) {
    // An error occurred in this.detectChanges(); this is usually because one
    // of the watched source directories is missing
    this.watchDeferred.reject(err)
  }
}

// You typically want to call watcher.quit().then()
Watcher.prototype.quit = function() {
  var self = this

  this.quitting = true
  if (this.timeoutID) {
    clearTimeout(this.timeoutID)
    this.timeoutID = null
  }

  return RSVP.resolve(this.currentBuild)
    .catch(function(err) {
      // Ignore build errors to stop them from being propagated to
      // RSVP.on('error')
    })
    .finally(function() {
      // It might have been rejected in the meantime, in which case this has
      // no effect
      self.watchDeferred.resolve()
    })
}
