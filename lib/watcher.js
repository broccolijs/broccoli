'use strict';

const RSVP = require('rsvp');
const WatcherAdapter = require('./watcher_adapter');
const logger = require('heimdalljs-logger')('broccoli:watcher');

// This Watcher handles all the Broccoli logic, such as debouncing. The
// WatcherAdapter handles I/O via the sane package, and could be pluggable in
// principle.

module.exports = Watcher;
function Watcher(builder, options) {
  this.options = options || {};
  if (this.options.debounce == null) this.options.debounce = 100;
  this.builder = builder;
  this.watcherAdapter = new WatcherAdapter(this.options.saneOptions);
  this.currentBuild = null;
  this._rebuildScheduled = false;
  this._ready = false;
  this._quitting = false;
  this._lifetimeDeferred = null;
}

RSVP.EventTarget.mixin(Watcher.prototype);

Watcher.prototype.start = function() {
  if (this._lifetimeDeferred != null)
    throw new Error('Watcher.prototype.start() must not be called more than once');
  this._lifetimeDeferred = RSVP.defer();

  this.watcherAdapter.on('change', this._change.bind(this));
  this.watcherAdapter.on('error', this._error.bind(this));
  RSVP.resolve()
    .then(() => {
      return this.watcherAdapter.watch(this.builder.watchedPaths);
    })
    .then(() => {
      logger.debug('ready');
      this._ready = true;
      this.currentBuild = this._build();
    })
    .catch(err => this._error(err));

  return this._lifetimeDeferred.promise;
};

Watcher.prototype._change = function() {
  if (!this._ready) {
    logger.debug('change', 'ignored: before ready');
    return;
  }
  if (this._rebuildScheduled) {
    logger.debug('change', 'ignored: rebuild scheduled already');
    return;
  }
  logger.debug('change');
  this._rebuildScheduled = true;
  // Wait for current build, and ignore build failure
  RSVP.resolve(this.currentBuild)
    .catch(() => {})
    .then(() => {
      if (this._quitting) return;
      const buildPromise = new RSVP.Promise(resolve => {
        logger.debug('debounce');
        this.trigger('debounce');
        setTimeout(resolve, this.options.debounce);
      }).then(() => {
        // Only set _rebuildScheduled to false *after* the setTimeout so that
        // change events during the setTimeout don't trigger a second rebuild
        this._rebuildScheduled = false;
        return this._build();
      });
      this.currentBuild = buildPromise;
    });
};

Watcher.prototype._build = function() {
  logger.debug('buildStart');
  this.trigger('buildStart');
  const buildPromise = this.builder.build();
  // Trigger change/error events. Importantly, if somebody else chains to
  // currentBuild, their callback will come after our events have
  // triggered, because we registered our callback first.
  buildPromise.then(
    () => {
      logger.debug('buildSuccess');
      this.trigger('buildSuccess');
    },
    err => {
      logger.debug('buildFailure');
      this.trigger('buildFailure', err);
    }
  );
  return buildPromise;
};

Watcher.prototype._error = function(err) {
  logger.debug('error', err);
  if (this._quitting) return;
  this._quit()
    .catch(() => {})
    .then(() => this._lifetimeDeferred.reject(err));
};

Watcher.prototype.quit = function() {
  if (this._quitting) {
    logger.debug('quit', 'ignored: already quitting');
    return;
  }
  this._quit().then(
    () => this._lifetimeDeferred.resolve(),
    err => this._lifetimeDeferred.reject(err)
  );
};

Watcher.prototype._quit = function() {
  this._quitting = true;
  logger.debug('quitStart');

  return RSVP.resolve()
    .then(() => this.watcherAdapter.quit())
    .finally(() => {
      // Wait for current build, and ignore build failure
      return RSVP.resolve(this.currentBuild).catch(() => {});
    })
    .finally(() => logger.debug('quitEnd'));
};
