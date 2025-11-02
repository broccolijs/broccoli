import CancelationError from './errors/cancelation';

export default class CancelationRequest {
  _pendingWork: Promise<void>;
  _canceling: Promise<void> | null;

  constructor(pendingWork: Promise<void>) {
    this._pendingWork = pendingWork; // all
    this._canceling = null;
  }

  get isCanceled() {
    return !!this._canceling;
  }

  throwIfRequested() {
    if (this.isCanceled) {
      throw new CancelationError('Build Canceled');
    }
  }

  then() {
    return this._pendingWork.then(...arguments);
  }

  cancel() {
    if (this._canceling) {
      return this._canceling;
    }

    this._canceling = this._pendingWork.catch(e => {
      if (CancelationError.isCancelationError(e)) {
        return;
      } else {
        throw e;
      }
    });
    return this._canceling;
  }
}
