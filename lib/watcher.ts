import path from 'path';
import sane from 'sane';
import { EventEmitter } from 'events';
import WatcherAdapter from './watcher_adapter';
import promiseFinally from 'promise.prototype.finally';
import SourceNodeWrapper from './wrappers/source-node';

const logger = require('heimdalljs-logger')('broccoli:watcher');

interface WatcherOptions {
  debounce?: number;
  watcherAdapter?: WatcherAdapter;
  saneOptions?: sane.Options;
}

// This Watcher handles all the Broccoli logic, such as debouncing. The
// WatcherAdapter handles I/O via the sane package, and could be pluggable in
// principle.

class Watcher extends EventEmitter {
  _changedFiles: string[];
  _quitting?: boolean; // is this ever set
  _rebuildScheduled: boolean;
  _ready: boolean;
  _quittingPromise: Promise<void> | null;
  _lifetime: {
    promise?: Promise<void>,
    resolve?: (value: any) => void;
    reject?: (error: any) => void;
  } | null;

  options: WatcherOptions;
  currentBuild: null | Promise<void | null>;
  watcherAdapter: WatcherAdapter;
  builder: any;

  constructor(builder: any, watchedNodes: SourceNodeWrapper[], options: WatcherOptions = {}) {
    super();
    this.options = options;
    if (this.options.debounce == null) {
      this.options.debounce = 100;
    }
    this.builder = builder;
    this.watcherAdapter =
      this.options.watcherAdapter || new WatcherAdapter(watchedNodes, this.options.saneOptions);

    this.currentBuild = null;
    this._rebuildScheduled = false;
    this._ready = false;
    this._quittingPromise = null;
    this._lifetime = null;
    this._changedFiles = [];
  }

  start() {
    if (this._lifetime != null) {
      throw new Error('Watcher.prototype.start() must not be called more than once');
    }

    this._lifetime = {};
    let lifetime = this._lifetime;
    lifetime.promise = new Promise((resolve, reject) => {
      lifetime.resolve = resolve;
      lifetime.reject = reject;
    });

    this.watcherAdapter.on('change', this._change.bind(this));
    this.watcherAdapter.on('error', this._error.bind(this));
    this.currentBuild = Promise.resolve()
      .then(() => {
        return this.watcherAdapter.watch();
      })
      .then(() => {
        logger.debug('ready');
        this._ready = true;
        this.currentBuild = this._build();
      })
      .catch(err => this._error(err))
      .then(() => this.currentBuild);

    return this._lifetime.promise;
  }

  _change(event: 'change', filePath: string, root: string) {
    this._changedFiles.push(path.join(root, filePath));
    if (!this._ready) {
      logger.debug('change', 'ignored: before ready');
      return;
    }
    if (this._rebuildScheduled) {
      logger.debug('change', 'ignored: rebuild scheduled already');
      return;
    }
    logger.debug('change', event, filePath, root);
    this.emit('change', event, filePath, root);

    this._rebuildScheduled = true;

    // Wait for current build, and ignore build failure
    return Promise.resolve(this.currentBuild)
      .catch(() => {})
      .then(() => {
        if (this._quitting) {
          return;
        }

        const buildPromise = new Promise(resolve => {
          logger.debug('debounce');
          this.emit('debounce');
          setTimeout(resolve, this.options.debounce);
        }).then(() => {
          // Only set _rebuildScheduled to false *after* the setTimeout so that
          // change events during the setTimeout don't trigger a second rebuild
          this._rebuildScheduled = false;
          return this._build(path.join(root, filePath));
        });
        this.currentBuild = buildPromise;
      });
  }

  _build(filePath?: string) {
    logger.debug('buildStart');
    this.emit('buildStart');

    const hrstart = process.hrtime();

    // This is to maintain backwards compatiblity with broccoli-sane-watcher
    let annotation = {
      type: filePath ? 'rebuild' : 'initial',
      reason: 'watcher',
      primaryFile: filePath,
      changedFiles: this._changedFiles,
    };

    const buildPromise = this.builder.build(null, annotation);
    // Trigger change/error events. Importantly, if somebody else chains to
    // currentBuild, their callback will come after our events have
    // triggered, because we registered our callback first.
    buildPromise.then(
      (results: { filePath?: string } = {}) => {
        const hrend = process.hrtime(hrstart);
        logger.debug('Build execution time: %ds %dms', hrend[0], Math.round(hrend[1] / 1e6));
        logger.debug('buildSuccess');

        // This property is added to keep compatiblity for ember-cli
        // as it relied on broccoli-sane-watcher to add it:
        // https://github.com/ember-cli/broccoli-sane-watcher/blob/48860/index.js#L92-L95
        //
        // This is "undefined" during the initial build.
        results.filePath = filePath;
        this._changedFiles = [];
        this.emit('buildSuccess', results);
      },
      (err: Error) => {
        this._changedFiles = [];
        logger.debug('buildFailure');
        this.emit('buildFailure', err);
      }
    );
    return buildPromise;
  }

  _error(err: any) {
    if (this._quittingPromise) {
      logger.debug('error', 'ignored: already quitting');
      return this._quittingPromise;
    }

    logger.debug('error', err);
    this.emit('error', err);
    return this._quit()
      .catch(() => {})
      .then(() => {
        if (this._lifetime && typeof this._lifetime.reject === 'function') {
          this._lifetime.reject(err) 
        }
      });
  }

  quit() {
    if (this._quittingPromise) {
      logger.debug('quit', 'ignored: already quitting');
      return this._quittingPromise;
    }

    let quitting = this._quit();

    if (this._lifetime && typeof this._lifetime.resolve === 'function') {
      this._lifetime.resolve(quitting);
      return this._lifetime.promise;
    } else {
      return quitting;
    }
  }

  _quit() {
    logger.debug('quitStart');
    this.emit('quitStart');

    this._quittingPromise = promiseFinally(
      promiseFinally(Promise.resolve().then(() => this.watcherAdapter.quit()), () => {
        // Wait for current build, and ignore build failure
        return Promise.resolve(this.currentBuild).catch(() => {});
      }),
      () => {
        logger.debug('quitEnd');
        this.emit('quitEnd');
      }
    );

    return this._quittingPromise;
  }
};

export = Watcher;