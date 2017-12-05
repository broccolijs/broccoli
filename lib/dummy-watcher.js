'use strict';

const RSVP = require('rsvp');

class Watcher {
  constructor(builder) {
    this.builder = builder;
    this.currentBuild = null;
    this._lifetimeDeferred = null;
  }

  start() {
    this._lifetimeDeferred = RSVP.defer();
    this.currentBuild = this.builder.build();
    this.currentBuild
      .then(() => this.trigger('buildSuccess'))
      .catch(err => this.trigger('buildFailure', err));
    return this._lifetimeDeferred.promise;
  }

  quit() {
    this._lifetimeDeferred.resolve();
  }
}

RSVP.EventTarget.mixin(Watcher.prototype);

module.exports = Watcher;
