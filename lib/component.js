var path = require('path')
var mktemp = require('mktemp')
var RSVP = require('rsvp')


exports.Component = Component
function Component () {}

// Called before each build
Component.prototype.setup = function (options) {
  var self = this
  if (this._setupOptions != null) {
    throw new Error(this + ' already set up. Did you insert it in more than one place? That is not (yet?) supported.')
  }
  this._setupOptions = {}
  Object.keys(options).forEach(function (key) {
    self._setupOptions[key] = options[key]
  })
  if (this._setupOptions.componentStack == null) {
    // `componentStack` is shared between this component and all of its
    // children, and is used for timing
    this._setupOptions.componentStack = []
  }
  this._setupChildComponents(this._childComponents || [])
  this._milliseconds = 0
}

// Called after each build
Component.prototype.teardown = function () {
  this._setupOptions = null
  this._teardownChildComponents(this._childComponents || [])
}

Component.prototype.addChildComponents = function (components) {
  this._childComponents = (this._childComponents || []).concat(components)
  if (this._setupOptions != null) this._setupChildComponents(components)
}

Component.prototype._setupChildComponents = function (components) {
  for (var i = 0; i < components.length; i++) {
    components[i].setup(this._setupOptions)
  }
}

Component.prototype._teardownChildComponents = function (components) {
  for (var i = 0; i < components.length; i++) {
    components[i].teardown()
  }
}

Component.prototype.toString = function () {
  return '[object ' + (this.constructor && this.constructor.name || 'Object') + ']'
}

Component.prototype.friendlyName = function () {
  return this.constructor && this.constructor.name || 'Object'
}

// Get the per-instance cache directory for this component
Component.prototype.getCacheDir = function () {
  if (this._cacheDir == null) {
    var cacheDirName = (this.constructor.name.toLowerCase() || 'component') + '-cache-XXXXXX.tmp'
    this._cacheDir = mktemp.createDirSync(path.join(this._setupOptions.cacheDir, cacheDirName))
  }
  return this._cacheDir
}

// Make a new temporary directory, which will be removed when the build has
// finished
Component.prototype.makeTmpDir = function () {
  var tmpDirName = (this.constructor.name.toLowerCase() || 'component') + '-XXXXXX.tmp'
  return mktemp.createDirSync(path.join(this._setupOptions.tmpDir, tmpDirName))
}

// Component::withTimer is the main entry point to a horrible profiling
// implementation. The time until the value or promise returned from fn has
// resolved is added to the current component's timing. We might remove all of
// this in the future.
Component.prototype.withTimer = function (fn) {
  var self = this
  acquireTimer()
  return RSVP.Promise.cast(fn()).finally(releaseTimer)

  function acquireTimer () {
    if (self._setupOptions.componentStack.length) {
      self._setupOptions.componentStack[self._setupOptions.componentStack.length - 1]
        ._stopTimer()
    }
    self._setupOptions.componentStack.push(self)
    self._startTimer()
  }

  function releaseTimer () {
    var poppedComponent = self._setupOptions.componentStack.pop()
    if (poppedComponent !== self) throw new Error('Expected to pop ' + self + ', got ' + poppedComponent)
    self._stopTimer()
    if (self._setupOptions.componentStack.length) {
      self._setupOptions.componentStack[self._setupOptions.componentStack.length - 1]
        ._startTimer()
    }
  }
}

Component.prototype._startTimer = function () {
  if (this._startTime != null) throw new Error(this + ': startTimer called twice')
  this._startTime = Date.now()
}

Component.prototype._stopTimer = function () {
  if (this._startTime == null) throw new Error(this + ': stopTimer called without startTimer')
  this._milliseconds += Date.now() - this._startTime
  this._startTime = null
}

Component.prototype._getTotalMilliseconds = function () {
  var total = this._milliseconds
  for (var i = 0; i < (this._childComponents || []).length; i++) {
    total += this._childComponents[i]._getTotalMilliseconds()
  }
  return total
}

Component.prototype.formatTimings = function (indent) {
  indent = indent || 0
  var blanks = Array(indent + 1).join(' ')
  var ownTimings = blanks + this.friendlyName() + ': ' + this._milliseconds + ' ms self'
  if (this._childComponents && this._childComponents.length) {
    ownTimings += ' (' + this._getTotalMilliseconds() + ' ms total)'
  }
  ownTimings += '\n'

  var childComponents = (this._childComponents || []).sort(function (a, b) {
    return b._getTotalMilliseconds() - a._getTotalMilliseconds()
  })
  var stop = false
  var childTimings = childComponents.map(function (childComponent) {
    if (stop) return ''
    if (childComponent._getTotalMilliseconds() <= 1) {
      stop = true
      return Array(indent + 3).join(' ') + '...\n'
    }
    return childComponent.formatTimings(indent + 2)
  })
  return ownTimings + childTimings.join('')
}
