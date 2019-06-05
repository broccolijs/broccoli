'use strict';

const EventEmitter = require('events').EventEmitter;
const sane = require('sane');
const logger = require('heimdalljs-logger')('broccoli:watcherAdapter');
const SourceNode = require('./wrappers/source-node');

function defaultFilterFunction(name) {
  return /^[^.]/.test(name);
}

function bindFileEvent(adapter, watcher, node, event) {
  watcher.on(event, (filepath, root) => {
    logger.debug(event, root + '/' + filepath);
    logger.debug(`revise called on node [${node.id}]`);
    node.revise();
    adapter.emit('change', event, filepath, root);
  });
}

module.exports = class WatcherAdapter extends EventEmitter {
  constructor(watchedNodes, options) {
    super();
    if (!Array.isArray(watchedNodes)) {
      throw new TypeError(
        `WatcherAdapter's first argument must be an array of SourceNodeWrapper nodes`
      );
    }
    for (const node of watchedNodes) {
      if (!(node instanceof SourceNode)) {
        throw new Error(`${node} is not a SourceNode`);
      }
      if (node.nodeInfo.watched !== true) {
        throw new Error(`'${node.nodeInfo.sourceDirectory}' is not watched`);
      }
    }
    this.watchedNodes = watchedNodes;
    this.options = options || {};
    this.options.filter = this.options.filter || defaultFilterFunction;
    this.watchers = [];
  }

  watch() {
    let watchers = this.watchedNodes.map(node => {
      const watchedPath = node.nodeInfo.sourceDirectory;
      const watcher = new sane(watchedPath, this.options);
      this.watchers.push(watcher);
      bindFileEvent(this, watcher, node, 'change');
      bindFileEvent(this, watcher, node, 'add');
      bindFileEvent(this, watcher, node, 'delete');

      return new Promise((resolve, reject) => {
        watcher.on('ready', resolve);
        watcher.on('error', reject);
      }).then(() => {
        watcher.removeAllListeners('ready');
        watcher.removeAllListeners('error');
        watcher.on('error', err => {
          logger.debug('error', err);
          this.emit('error', err);
        });
        logger.debug('ready', watchedPath);
      });
    });
    return Promise.all(watchers).then(() => {});
  }

  quit() {
    let closing = this.watchers.map(
      watcher =>
        new Promise((resolve, reject) =>
          watcher.close(err => {
            if (err) reject(err);
            else resolve();
          })
        )
    );
    this.watchers.length = 0;
    return Promise.all(closing).then(() => {});
  }
};

module.exports.bindFileEvent = bindFileEvent;
