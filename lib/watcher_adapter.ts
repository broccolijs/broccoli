import sane from 'sane';
import { EventEmitter } from 'events';
import SourceNode from './wrappers/source-node';
import SourceNodeWrapper from './wrappers/source-node';
import bindFileEvent from './utils/bind-file-event';
import HeimdallLogger from 'heimdalljs-logger';
import { isAbsolute, relative } from 'path';

const logger = new HeimdallLogger('broccoli:watcherAdapter');

class WatcherAdapter extends EventEmitter {
  watchers: sane.Watcher[];
  watchedNodes: SourceNodeWrapper[];
  options: sane.Options;
  private ignored: string[] | undefined;

  constructor(
    watchedNodes: SourceNodeWrapper[],
    options: sane.Options = {},
    ignored: string[] | undefined = undefined
  ) {
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
    this.options = options;
    this.ignored = ignored;
    this.watchers = [];
  }

  watch() {
    const watchers = this.watchedNodes.map((node: SourceNodeWrapper) => {
      const watchedPath = node.nodeInfo.sourceDirectory;
      const watcher = sane(watchedPath, this.optionsFor(watchedPath));
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
        watcher.on('error', (err: Error) => {
          logger.debug('error', err);
          this.emit('error', err);
        });
        logger.debug('ready', watchedPath);
      });
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return Promise.all(watchers).then(() => {});
  }

  quit() {
    const closing = this.watchers.map(
      (watcher: sane.Watcher) =>
        new Promise((resolve, reject) =>
          // @ts-ignore
          watcher.close((err: any) => {
            if (err) reject(err);
            else resolve();
          })
        )
    );
    this.watchers.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return Promise.all(closing).then(() => {});
  }

  private optionsFor(watchedPath: string): sane.Options {
    let options = this.options;
    if (this.ignored) {
      // we need to convert any absolute ignored paths to local paths that sit
      // within the watchedPath
      const localIgnored = this.ignored
        .map(ignoredAbsPath => {
          const ignoredRelativePath = relative(watchedPath, ignoredAbsPath);
          if (!ignoredRelativePath.startsWith('..') && !isAbsolute(ignoredRelativePath)) {
            return ignoredRelativePath + '/**';
          }
        })
        .filter(Boolean) as string[];
      if (localIgnored.length > 0) {
        options = Object.assign({}, options, { ignored: localIgnored });
      }
    }
    return options;
  }
}

export = WatcherAdapter;
