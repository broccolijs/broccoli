var fs = require('fs')
var RSVP = require('rsvp')
var symlinkOrCopySync = require('symlink-or-copy').sync

// Create various test plugins subclassing from Plugin. Wrapped in a function
// to allow for testing against different Plugin versions.
module.exports = function(Plugin) {
  var plugins = {}

  plugins.NoopPlugin = NoopPlugin
  NoopPlugin.prototype = Object.create(Plugin.prototype)
  NoopPlugin.prototype.constructor = NoopPlugin
  function NoopPlugin(inputNodes, options) {
    Plugin.call(this, inputNodes || [], options)
  }
  NoopPlugin.prototype.build = function() {
  }

  // This plugin writes foo.js into its outputPath
  plugins.VeggiesPlugin = VeggiesPlugin
  VeggiesPlugin.prototype = Object.create(Plugin.prototype)
  VeggiesPlugin.prototype.constructor = VeggiesPlugin
  function VeggiesPlugin(inputNodes, options) {
    Plugin.call(this, inputNodes || [], options)
  }
  VeggiesPlugin.prototype.build = function() {
    fs.writeFileSync(this.outputPath + '/veggies.txt', 'tasty')
  }

  plugins.MergePlugin = MergePlugin
  MergePlugin.prototype = Object.create(Plugin.prototype)
  MergePlugin.prototype.constructor = MergePlugin
  function MergePlugin(inputNodes, options) {
    Plugin.call(this, inputNodes, options)
  }
  MergePlugin.prototype.build = function() {
    for (var i = 0; i < this.inputPaths.length; i++) {
      symlinkOrCopySync(this.inputPaths[i], this.outputPath + '/' + i)
    }
  }

  plugins.FailingPlugin = FailingPlugin
  FailingPlugin.prototype = Object.create(Plugin.prototype)
  FailingPlugin.prototype.constructor = FailingPlugin
  function FailingPlugin(errorObject, options) {
    Plugin.call(this, [], options)
    this.errorObject = errorObject
  }
  FailingPlugin.prototype.build = function() {
    throw this.errorObject
  }

  // Plugin for testing asynchrony. buildFinished is a deferred (RSVP.defer()).
  // The build will stall until you call node.finishBuild().
  // To wait until the build starts, chain on node.buildStarted.
  // Don't build more than once.
  plugins.AsyncPlugin = AsyncPlugin
  AsyncPlugin.prototype = Object.create(Plugin.prototype)
  AsyncPlugin.prototype.constructor = AsyncPlugin
  function AsyncPlugin(inputNodes, options) {
    Plugin.call(this, inputNodes || [], options)
    this.buildFinishedDeferred = RSVP.defer()
    this.buildStartedDeferred = RSVP.defer()
    this.buildStarted = this.buildStartedDeferred.promise
  }
  AsyncPlugin.prototype.build = function() {
    this.buildStartedDeferred.resolve()
    return this.buildFinishedDeferred.promise
  }
  AsyncPlugin.prototype.finishBuild = function(err) {
    if (err != null) {
      this.buildFinishedDeferred.reject(err)
    } else {
      this.buildFinishedDeferred.resolve()
    }
  }

  plugins.SleepingPlugin = SleepingPlugin
  SleepingPlugin.prototype = Object.create(Plugin.prototype)
  SleepingPlugin.prototype.constructor = SleepingPlugin
  function SleepingPlugin(inputNodes) {
    Plugin.call(this, inputNodes || [])
  }
  SleepingPlugin.prototype.build = function() {
    return new RSVP.Promise(function(resolve, reject) {
      setTimeout(resolve, 10)
    })
  }

  return plugins
}
