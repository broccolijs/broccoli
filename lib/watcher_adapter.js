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
  this.watchers = [];
  this.readyPromises = [];

  watchedPaths.forEach(watchedPath => {
    const watcher = new sane(watchedPath, this.options);

    function bindFileEvent(event) {
      watcher.on(event, (filepath, root) => {
        logger.debug(event, root + '/' + filepath);
        this.trigger('change');
      });
    }
    bindFileEvent('change');
    bindFileEvent('add');
    bindFileEvent('delete');

    watcher.on('error', err => {
      logger.debug('error', err);
      this.trigger('error', err);
    });

    const readyPromise = new RSVP.Promise(resolve => {
      watcher.on('ready', () => {
        logger.debug('ready', watchedPath);
        resolve();
      });
    });

    this.watchers.push(watcher);
    this.readyPromises.push(readyPromise);
  });

  return RSVP.Promise.all(this.readyPromises);
};

WatcherAdapter.prototype.quit = function() {
  for (let i = 0; i < this.watchers.length; i++) {
    this.watchers[i].close();
  }
};
