'use strict';

const NodeWrapper = require('./node');
const fs = require('fs');
const undefinedToNull = require('../utils/undefined-to-null');
const rimraf = require('rimraf');
const logger = require('heimdalljs-logger')('broccoli:transform-node');

module.exports = class TransformNodeWrapper extends NodeWrapper {
  setup(features) {
    this.nodeInfo.setup(features, {
      inputPaths: this.inputPaths,
      outputPath: this.outputPath,
      cachePath: this.cachePath,
    });
    this.callbackObject = this.nodeInfo.getCallbackObject();

    // This weakmap holds references from inputNode --> last known revision #
    // If the any inputNode's ref does not match what is stored in here then we
    // know a modification has happened so we call the build method
    this.inputRevisions = new WeakMap();
  }

  shouldBuild() {
    // The plugin has told us they should always build
    if (this.nodeInfo.volatile === true) {
      return true;
    }

    // Memoization is currently optin via BROCCOLI_ENABLED_MEMOIZE = true
    if (process.env.BROCCOLI_ENABLED_MEMOIZE !== 'true') {
      return true;
    }

    // The plugin has no input nodes so it's build method should not
    // be called after the first build
    if (this.inputNodeWrappers.length === 0 && this.revision === 0) {
      return true;
    }

    let nodesThatChanged = [];
    this.inputNodeWrappers.forEach(wrapper => {
      if (this.inputRevisions.get(wrapper) !== wrapper.revision) {
        nodesThatChanged.push(wrapper.id);
        this.inputRevisions.set(wrapper, wrapper.revision);
      }
    });

    if (nodesThatChanged.length > 0) {
      logger.debug(`${this.id} built because inputNodes [${nodesThatChanged.join(', ')}] changed`);

      return true;
    }

    return false;
  }

  build() {
    let startTime;

    return new Promise(resolve => {
      startTime = process.hrtime();

      if (!this.shouldBuild()) {
        this.buildState.built = false;
        return resolve(); // Noop the build since inputs did not change
      }

      if (!this.nodeInfo.persistentOutput) {
        rimraf.sync(this.outputPath);
        fs.mkdirSync(this.outputPath);
      }

      resolve(this.callbackObject.build());

      this.revise();
    }).then(() => {
      const now = process.hrtime();
      const endTime = process.hrtime(startTime);

      // Build time in milliseconds
      this.buildState.selfTime = 1000 * (now[0] - startTime[0] + (now[1] - startTime[1]) / 1e9);
      this.buildState.totalTime = this.buildState.selfTime;
      for (let i = 0; i < this.inputNodeWrappers.length; i++) {
        this.buildState.totalTime += this.inputNodeWrappers[i].buildState.totalTime;
      }

      if (this.buildState.selfTime >= 100) {
        logger.debug(
          `Node build execution time: %ds %dms`,
          endTime[0],
          Math.round(endTime[1] / 1e6)
        );
      }
    });
  }

  toString() {
    let hint = this.label;
    if (this.inputNodeWrappers) {
      // a bit defensive to deal with partially-constructed node wrappers
      hint += ' inputNodeWrappers:[' + this.inputNodeWrappers.map(nw => nw.id) + ']';
    }
    hint += ' at ' + this.outputPath;
    if (this.buildState.selfTime != null) {
      hint += ' (' + Math.round(this.buildState.selfTime) + ' ms)';
    }
    return '[NodeWrapper:' + this.id + ' ' + hint + ']';
  }

  nodeInfoToJSON() {
    return undefinedToNull({
      nodeType: 'transform',
      name: this.nodeInfo.name,
      annotation: this.nodeInfo.annotation,
      persistentOutput: this.nodeInfo.persistentOutput,
      needsCache: this.nodeInfo.needsCache,
      // leave out instantiationStack (too long), inputNodes, and callbacks
    });
  }
};
