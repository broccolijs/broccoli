import { EventEmitter } from 'events';

class Watcher extends EventEmitter {
  builder: any;
  currentBuild: any;
  _lifetimeDeferred: {
    promise?: Promise<void>,
    resolve?: (value?: any) => void;
    reject?: (error?: any) => void;
  };

  constructor(builder: any) {
    super();
    this.builder = builder;
    this.currentBuild = null;
    this._lifetimeDeferred = {};
    let lifetime = this._lifetimeDeferred;
    lifetime.promise = new Promise((resolve, reject) => {
      lifetime.resolve = resolve;
      lifetime.reject = reject;
    });
  }

  start() {
    this.currentBuild = this.builder.build();
    this.currentBuild
      .then(() => this.emit('buildSuccess'))
      .catch((err: any) => this.emit('buildFailure', err));
    return this._lifetimeDeferred.promise;
  }

  quit() {
    if (this._lifetimeDeferred.resolve) {
      this._lifetimeDeferred.resolve();
    }
  }
};

export = Watcher;