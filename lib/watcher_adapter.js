'use strict';

const sane = require('sane');
const RSVP = require('rsvp');
const logger = require('heimdalljs-logger')('broccoli:watcherAdapter');

function defaultFilterFunction(name) {
  return /^[^.]/.test(name);
}

function bindFileEvent(adapter, watcher, event) {
  watcher.on(event, (filepath, root) => {
    logger.debug(event, root + '/' + filepath);
    adapter.trigger('change');
  });
}

class WatcherAdapter {
  constructor(options) {
    this.options = options || {};
    this.options.filter = this.options.filter || defaultFilterFunction;
    this.watchers = [];
  }

  watch(watchedPaths) {
    if (!Array.isArray(watchedPaths)) {
      throw new TypeError(`WatcherAdapter#watch's first argument must be an array of watchedPaths`);
    }

    let watchers = watchedPaths.map(watchedPath => {
      return new Promise(resolve => {
        const watcher = new sane(watchedPath, this.options);
        this.watchers.push(watcher);

        bindFileEvent(this, watcher, 'change');
        bindFileEvent(this, watcher, 'add');
        bindFileEvent(this, watcher, 'delete');

        watcher.on('error', err => {
          logger.debug('error', err);
          this.trigger('error', err);
        });

        watcher.on('ready', () => {
          logger.debug('ready', watchedPath);
          resolve(watcher);
        });
      });
    });

    return Promise.all(watchers).then(function() {});
  }

  quit() {
    let closing = this.watchers.map(watcher => {
      return new Promise((resolve, reject) => {
        watcher.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    this.watchers.length = 0;

    return Promise.all(closing).then(function() {});
  }
}
module.exports = WatcherAdapter;
RSVP.EventTarget.mixin(WatcherAdapter.prototype);
module.exports.bindFileEvent = bindFileEvent;
