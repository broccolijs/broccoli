var RSVP = require('rsvp')


// Note: This Component class is a really cumbersome way to implement
// dependency injection. It will have to be refactored.

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
  this._startTime = null
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
