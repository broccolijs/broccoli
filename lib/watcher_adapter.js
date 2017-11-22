'use strict';

const sane = require('sane');
const RSVP = require('rsvp');
const logger = require('heimdalljs-logger')('broccoli:watcherAdapter');

function defaultFilterFunction(name) {
  return /^[^.]/.test(name);
}

function bindFileEvent(watcher, event) {
  watcher.on(event, (filepath, root) => {
    logger.debug(event, root + '/' + filepath);
    this.trigger('change');
  });
}

class WatcherAdapter {
  constructor(options) {
    this.options = options || {};
    this.options.filter = this.options.filter || defaultFilterFunction;
  }

  watch(watchedPaths) {
    this.watchers = [];
    this.readyPromises = [];

    watchedPaths.forEach(watchedPath => {
      const watcher = new sane(watchedPath, this.options);

      bindFileEvent(watcher, 'change');
      bindFileEvent(watcher, 'add');
      bindFileEvent(watcher, 'delete');

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
  }

  quit() {
    for (let i = 0; i < this.watchers.length; i++) {
      this.watchers[i].close();
    }
  }
}
module.exports = WatcherAdapter;
RSVP.EventTarget.mixin(WatcherAdapter.prototype);
