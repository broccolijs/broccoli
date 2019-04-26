'use strict';

const undefinedToNull = require('../utils/undefined-to-null');

module.exports = class NodeWrapper {
  constructor() {
    this.buildState = {};
    this._revision = 0;
    this._revised = false;
  }

  revise() {
    this._revised = true;
  }

  get revision() {
    return this._revision;
  }

  set revision(value) {
    this._revision = value;
  }

  settle() {
    if (this._revised) {
      this._revised = false;
      this._revision++;
    }
  }

  toJSON() {
    return undefinedToNull({
      id: this.id,
      nodeInfo: this.nodeInfoToJSON(),
      buildState: this.buildState,
      label: this.label,
      inputNodeWrappers: this.inputNodeWrappers.map(nw => nw.id),
      cachePath: this.cachePath,
      outputPath: this.outputPath,
      // leave out node, originalNode, inputPaths (redundant), build
    });
  }

  formatInstantiationStackForTerminal() {
    return '\n-~- created here: -~-\n' + this.nodeInfo.instantiationStack + '\n-~- (end) -~-';
  }
};
