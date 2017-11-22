'use strict';

const sane = require('sane');
const RSVP = require('rsvp');
const logger = require('heimdalljs-logger')('broccoli:watcherAdapter');

function defaultFilterFunction(name) {
  return /^[^.]/.test(name);
}

module.exports = WatcherAdapter;
RSVP.EventTarget.mixin(WatcherAdapter.prototype);
function WatcherAdapter(options) {
  this.options = options || {};
  this.options.filter = this.options.filter || defaultFilterFunction;
}

WatcherAdapter.prototype.watch = function(watchedPaths) {
  const self = this;

  this.watchers = [];
  this.readyPromises = [];
  watchedPaths.forEach(function(watchedPath) {
    const watcher = new sane(watchedPath, self.options);
    function bindFileEvent(event) {
      watcher.on(event, function(filepath, root) {
        logger.debug(event, root + '/' + filepath);
        self.trigger('change');
      });
    }
    bindFileEvent('change');
    bindFileEvent('add');
    bindFileEvent('delete');
    watcher.on('error', function(err) {
      logger.debug('error', err);
      self.trigger('error', err);
    });
    const readyPromise = new RSVP.Promise(function(resolve) {
      watcher.on('ready', function() {
        logger.debug('ready', watchedPath);
        resolve();
      });
    });
    self.watchers.push(watcher);
    self.readyPromises.push(readyPromise);
  });
  return RSVP.Promise.all(this.readyPromises);
};

WatcherAdapter.prototype.quit = function() {
  for (let i = 0; i < this.watchers.length; i++) {
    this.watchers[i].close();
  }
};
