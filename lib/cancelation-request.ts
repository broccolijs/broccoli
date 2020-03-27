import CancelationError from './errors/cancelation';

export default class CancelationRequest {
  private _pendingWork: Promise<void>;
  private _canceling: Promise<void> | null;
  private _cancelationError = new CancelationError('Build Canceled');

  constructor(pendingWork: Promise<void>) {
    this._pendingWork = pendingWork; // all
    this._canceling = null;
  }

  get isCanceled() {
    return !!this._canceling;
  }

  throwIfRequested() {
    if (this.isCanceled) {
      throw this._cancelationError;
    }
  }

  then() {
    return this._pendingWork.then(...arguments);
  }

  cancel(cancelationError?: CancelationError) {
    if (this._canceling) {
      return this._canceling;
    }

    if (cancelationError) {
      this._cancelationError = cancelationError;
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
