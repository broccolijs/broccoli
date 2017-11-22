'use strict';

const fs = require('fs');
const RSVP = require('rsvp');
const symlinkOrCopySync = require('symlink-or-copy').sync;

// Create various test plugins subclassing from Plugin. Wrapped in a function
// to allow for testing against different Plugin versions.
module.exports = function(Plugin) {
  const plugins = {};

  plugins.NoopPlugin = class NoopPlugin extends Plugin {
    build() {}
  };

  // This plugin writes foo.js into its outputPath
  plugins.VeggiesPlugin = class VeggiesPlugin extends Plugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
    }

    build() {
      fs.writeFileSync(this.outputPath + '/veggies.txt', 'tasty');
    }
  };

  plugins.MergePlugin = class MergePlugin extends Plugin {
    build() {
      for (let i = 0; i < this.inputPaths.length; i++) {
        symlinkOrCopySync(this.inputPaths[i], this.outputPath + '/' + i);
      }
    }
  };

  plugins.FailingPlugin = class FailingPlugin extends Plugin {
    constructor(errorObject, options) {
      super([], options);
      this.errorObject = errorObject;
    }

    build() {
      throw this.errorObject;
    }
  };

  // Plugin for testing asynchrony. buildFinished is a deferred (RSVP.defer()).
  // The build will stall until you call node.finishBuild().
  // To wait until the build starts, chain on node.buildStarted.
  // Don't build more than once.
  plugins.AsyncPlugin = class AsyncPlugin extends Plugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
      this.buildFinishedDeferred = RSVP.defer();
      this.buildStartedDeferred = RSVP.defer();
      this.buildStarted = this.buildStartedDeferred.promise;
    }

    build() {
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

  plugins.SleepingPlugin = class SleepingPlugin extends Plugin {
    constructor(inputNodes, options) {
      super(inputNodes || [], options);
    }

    build() {
      return new RSVP.Promise(resolve => setTimeout(resolve, 10));
    }
  };

  return plugins;
};
