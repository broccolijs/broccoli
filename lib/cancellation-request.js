'use strict';

const CancelationError = require('./errors/cancelation');
const BuilderError = require('./errors/builder');

module.exports = class CancelationRequest {
  constructor(pendingWork) {
    this._isCancelled = false;
    this._pendingWork = pendingWork; // all
  }

  get isCancelled() {
    return this._isCancelled;
  }

  throwIfRequested() {
    if (this._isCancelled) {
      throw new CancelationError('BUILD CANCELLED');
    }
  }

  cancel() {
    // if we ever expose the cancellation to plugins, we should not expose
    // cancel(), rather it should be expose similarity to the Promise
    // executor
    this._isCancelled = true;

    return this._pendingWork.catch(e => {
      // a rejection with a cancel cancel promise
      if (BuilderError.isBuilderError(e)) {
        return;
      }

      throw e;
    });
  }
};
