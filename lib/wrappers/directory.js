'use strict';

module.exports = class DirectoryWrapper {
  constructor(directory) {
    this.directory = directory;
    this._revision = 0;
    this._revised = false;
  }

  hasChanges() {
    return this._revised;
  }

  revise() {
    if (!this._revised) {
      this._revised = true;
      this._revision++;
    }
  }

  get revision() {
    return this._revision;
  }

  settle() {
    if (!this._revised) {
      return false;
    }

    this._revised = false;
    return true;
  }
}