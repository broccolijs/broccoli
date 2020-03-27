import path from 'path';
import sane from 'sane';
import { EventEmitter } from 'events';
import WatcherAdapter from './watcher_adapter';
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

type Deferred = {
  promise: Promise<void>;
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}

function deferred() : Deferred {
  const deferred = {} as Deferred;
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject ;
  });

  return deferred;
}

class Watcher extends EventEmitter {
  private _changedFiles: string[] = [];
  private _quitting?: boolean; // is this ever set
  private _rebuildScheduled = false;
  private _ready = false;
  private _quittingPromise: Promise<void> | null = null;
  private _lifetime: Deferred | null = null;
  private _nextBuild? = deferred();
  private _currentBuild?: Promise<void>;
  private _activeBuild = false;

  options: WatcherOptions;
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
    if (this._nextBuild) {
      this._nextBuild.promise.catch(() => {});
    }
  }

  get currentBuild() {
    if (this._nextBuild) {
      return this._nextBuild.promise;
    } else {
      return this._currentBuild;
    }
  }

  start() {
    if (this._lifetime != null) {
      throw new Error('Watcher.prototype.start() must not be called more than once');
    }

    this._lifetime = deferred();
    this._lifetime.promise.catch(() => {});

    this.watcherAdapter.on('change', this._change.bind(this));
    this.watcherAdapter.on('error', this._error.bind(this));

    (async () => {
      try {
        await this.watcherAdapter.watch();
        logger.debug('ready');
        this.emit('ready');
        this._ready = true;
      } catch (e) {
        this._error(e);
      }

      try {
        await this._build();
      } catch (e) {
        // _build handles error reporting internally
      }
    })()

    return this._lifetime.promise;
  }

  async ready() {
    await new Promise(resolve => this.once('ready', resolve));
  }

  async _change(event: 'change', filePath: string, root: string) {
    this._changedFiles.push(path.join(root, filePath));
    if (!this._ready) {
      logger.debug('change', 'ignored: before ready');
      return;
    }
    logger.debug('change', event, filePath, root);
    this.emit('change', event, filePath, root);

    if (this._quitting) {
      await this.currentBuild;
    } else if (this._activeBuild) {
      await this.builder.retry(this.options.debounce);
    } else {
      try {
        await this._build(path.join(root, filePath));
      } catch (e) {
        // _build handles error reporting internally
      }
    }
  }

  async _build(filePath?: string) : Promise<void> {
    logger.debug('buildStart');
    this.emit('buildStart');

    const start = process.hrtime();

    // This is to maintain backwards compatibility with broccoli-sane-watcher
    const annotation = {
      type: filePath ? 'rebuild' : 'initial',
      reason: 'watcher',
      primaryFile: filePath,
      changedFiles: this._changedFiles,
    };

    this._activeBuild = true;
    const buildPromise = this.builder.build(null, annotation);
    // Trigger change/error events. Importantly, if somebody else chains to
    // currentBuild, their callback will come after our events have
    // triggered, because we registered our callback first.
    buildPromise.then(
      (results: { filePath?: string } = {}) => {
        const end = process.hrtime(start);
        logger.debug('Build execution time: %ds %dms', end[0], Math.round(end[1] / 1e6));
        logger.debug('buildSuccess');

        // This property is added to keep compatibility for ember-cli
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
    ).finally(() => this._activeBuild = false);


    if (this._nextBuild) {
      this._nextBuild.resolve(buildPromise);
    }
    this._currentBuild = buildPromise;
    this._nextBuild = undefined;

    buildPromise.catch(() => {
      /**
       * The watcher internally follows currentBuild, and outputs errors appropriately.
       * Since watcher.currentBuild is public API, we must allow public follows
       * to still be informed of rejections.  However we do not want `_currentBuild` itself
       * to trigger unhandled rejections.
       *
       * By catching errors here, but returning `promise` instead of the chain from
       * `promise.catch`, both goals are accomplished.
       */
    });

    return this._currentBuild;
  }

  async _error(err: any) {
    if (this._quittingPromise) {
      logger.debug('error', 'ignored: already quitting');
      return this._quittingPromise;
    }

    logger.debug('error', err);
    this.emit('error', err);

    try {
      await this._quit();
    } catch (e) {
      // ignore errors that occur during quitting
    }

    if (this._lifetime && typeof this._lifetime.reject === 'function') {
      this._lifetime.reject(err);
    }
  }

  quit(): Promise<void> {
    if (this._quittingPromise) {
      logger.debug('quit', 'ignored: already quitting');
      return this._quittingPromise;
    }

    let quitting = this._quit();

    if (this._lifetime && typeof this._lifetime.resolve === 'function') {
      this._lifetime.resolve(quitting);
      return this._lifetime.promise!;
    } else {
      return quitting;
    }
  }

  _quit() {
    logger.debug('quitStart');
    this.emit('quitStart');

    this._quittingPromise = (async () => {
      try {
        await Promise.all([
          this.builder.cancel(),
          this.watcherAdapter.quit(),
        ])
      } catch (e) {
      } finally {
        try {
          if (this._nextBuild) {
            this._nextBuild.resolve();
          }
          await this.currentBuild;
        } catch (e) {
          // Wait for current build, and ignore build failure
        }
        logger.debug('quitEnd');
        this.emit('quitEnd');
      }
    })();

    return this._quittingPromise;
  }
}

export = Watcher;
