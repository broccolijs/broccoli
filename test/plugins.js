'use strict';

const fs = require('fs');
const symlinkOrCopySync = require('symlink-or-copy').sync;

// Create various test plugins subclassing from Plugin. Wrapped in a function
// to allow for testing against different Plugin versions.
module.exports = function(Plugin) {
  const plugins = {};

  class CountingPlugin extends Plugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
      this._count = 0;
    }

    build() {
      this._count++;
    }

    get buildCount() {
      return this._count;
    }
  }

  plugins.Noop = class NoopPlugin extends CountingPlugin {};

  // This plugin writes foo.js into its outputPath
  plugins.Veggies = class VeggiesPlugin extends CountingPlugin {
    build() {
      super.build();
      fs.writeFileSync(this.outputPath + '/veggies.txt', 'tasty');
    }
  };

  plugins.Merge = class MergePlugin extends CountingPlugin {
    build() {
      super.build();
      for (let i = 0; i < this.inputPaths.length; i++) {
        symlinkOrCopySync(this.inputPaths[i], this.outputPath + '/' + i);
      }
    }
  };

  plugins.Failing = class FailingPlugin extends CountingPlugin {
    constructor(errorObject, options) {
      super([], options);
      this.errorObject = errorObject;
    }

    build() {
      super.build();
      throw this.errorObject;
    }
  };

  // Plugin for testing asynchrony. buildFinished is a deferred (RSVP.defer()).
  // The build will stall until you call node.finishBuild().
  // To wait until the build starts, chain on node.buildStarted.
  // Don't build more than once.
  plugins.Async = class AsyncPlugin extends CountingPlugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
      let buildFinishedDeferred = (this.buildFinishedDeferred = {});
      buildFinishedDeferred.promise = new Promise((resolve, reject) => {
        buildFinishedDeferred.resolve = resolve;
        buildFinishedDeferred.reject = reject;
      });
      let buildStartedDeferred = (this.buildStartedDeferred = {});
      buildStartedDeferred.promise = new Promise((resolve, reject) => {
        buildStartedDeferred.resolve = resolve;
        buildStartedDeferred.reject = reject;
      });
      this.buildStarted = this.buildStartedDeferred.promise;
    }

    build() {
      super.build();
      this.buildStartedDeferred.resolve();
      return this.buildFinishedDeferred.promise;
    }

    finishBuild(err) {
      if (err != null) {
        this.buildFinishedDeferred.reject(err);
      } else {
        this.buildFinishedDeferred.resolve();
      }
    }
  };

  plugins.Sleeping = class SleepingPlugin extends CountingPlugin {
    constructor(inputNodes, options) {
      options = options || {};
      options.sleep = options.sleep || 10;
      super(inputNodes || [], options);
      this.options = options;
    }

    build() {
      super.build();
      return new Promise(resolve => setTimeout(resolve, this.options.sleep));
    }
  };

  plugins.Deferred = class DeferredPlugin extends CountingPlugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }

    build() {
      super.build();
      return this.promise;
    }
  };

  return plugins;
};
