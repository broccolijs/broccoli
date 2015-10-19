'use strict'

var broccoli = require('..')
var Builder = broccoli.Builder
var Watcher = broccoli.Watcher

FastWatcher.prototype = Object.create(Watcher.prototype)
FastWatcher.prototype.constructor = FastWatcher
function FastWatcher(builder) {
  Watcher.call(this, builder, { interval: 5 })
}

require('./watcher_test_suite')(FastWatcher, Builder, 15)
