'use strict';

const fs = require('fs');
const RSVP = require('rsvp');
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
      this.buildFinishedDeferred = RSVP.defer();
      this.buildStartedDeferred = RSVP.defer();
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
      super(inputNodes || [], options);
    }

    build() {
      super.build();
      return new RSVP.Promise(resolve => setTimeout(resolve, 10));
    }
  };

  plugins.Deferred = class DeferredPlugin extends CountingPlugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
      this.promise = new RSVP.Promise((resolve, reject) => {
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
