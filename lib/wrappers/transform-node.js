'use strict';

const NodeWrapper = require('./node');
const fs = require('fs');
const undefinedToNull = require('../utils/undefined-to-null');
const rimraf = require('rimraf');
const logger = require('heimdalljs-logger')('broccoli:wrappers:transform-node');

module.exports = class TransformNodeWrapper extends NodeWrapper {
  setup(features) {
    this.nodeInfo.setup(features, {
      inputPaths: this.inputPaths,
      outputPath: this.outputPath,
      cachePath: this.cachePath,
    });
    this.callbackObject = this.nodeInfo.getCallbackObject();
    this.callbackObject.revised = () => {
      this.revised();
    };

    // This weakmap holds references from inputNode --> last known revision #
    // If the any inputNode's ref does not match what is stored in here then we
    // know a modification has happened so we call the build method
    this.inputRevisions = new WeakMap();
  }

  // Memoization is currently optin via either BROCCOLI_VOLATILE = true or
  // by a plugin specifing that they are volatile
  memoizationEnabled(volatile) {
    return volatile || process.env.BROCCOLI_VOLATILE === 'true';
  }

  shouldBuild() {
    let shouldBuild = false;

    // The plugin has no input nodes so it's build method should not
    // be called after the first build
    if (this.inputNodeWrappers.length === 0 && this.revision > 0) {
      return false;
    }

    this.inputNodeWrappers.forEach(wrapper => {
      if (this.inputRevisions.get(wrapper) !== wrapper.revision) {
        logger.debug(`${wrapper.toString()} has been revised since last build.`);
        shouldBuild = true;
        this.inputRevisions.set(wrapper, wrapper.revision);
      }
    });

    return shouldBuild;
  }

  build() {
    let startTime;

    return new Promise(resolve => {
      startTime = process.hrtime();

      if (this.memoizationEnabled(this.nodeInfo.volatile)) {
        let shouldBuild = this.shouldBuild();

        if (!shouldBuild) {
          logger.debug(
            `${this.toString()}'s inputNodes have not been revised. Skipping building this node.`
          );

          return resolve(); // Noop the build since inputs did not change
        }
      }

      if (!this.nodeInfo.persistentOutput) {
        rimraf.sync(this.outputPath);
        fs.mkdirSync(this.outputPath);
      }

      resolve(this.callbackObject.build());

      // If the plugin is volatile then it will be responsible for calling revise.
      if (!this.nodeInfo.volatile) {
        this.revise();
      }
    }).then(() => {
      const now = process.hrtime();

      // Build time in milliseconds
      this.buildState.selfTime = 1000 * (now[0] - startTime[0] + (now[1] - startTime[1]) / 1e9);
      this.buildState.totalTime = this.buildState.selfTime;
      for (let i = 0; i < this.inputNodeWrappers.length; i++) {
        this.buildState.totalTime += this.inputNodeWrappers[i].buildState.totalTime;
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
