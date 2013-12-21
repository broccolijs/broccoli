var fs = require('fs')
var test = require('tap').test
var mktemp = require('mktemp')
var broccoli = require('../')
var tmpDir = require('./helpers/tmp-dir')

var Component = broccoli.Component

test('Component', function (t) {
  var component
  var globalCacheDir
  var perBuildTmpDir
  function makeComponent () {
    component = new Component
    globalCacheDir = mktemp.createDirSync(tmpDir + '/component-test-cache-XXXXX')
    perBuildTmpDir = mktemp.createDirSync(tmpDir + '/component-test-build-XXXXX')
    component.setup({
      tmpDir: perBuildTmpDir,
      cacheDir: globalCacheDir
    })
  }

  test('per-component-instance cache directory', function (t) {
    makeComponent()
    t.deepEqual(fs.readdirSync(globalCacheDir), [],
      'cache directory is only created on request')

    var componentCacheDir = component.getCacheDir()
    t.equal(fs.readdirSync(globalCacheDir).length, 1,
      'cache directory has been created inside the global cache directory')
    t.deepEqual(fs.readdirSync(componentCacheDir), [],
      'cache directory is empty')

    component.removeCacheDir()
    t.equal(fs.readdirSync(globalCacheDir).length, 0,
      'cache directory has been removed')

    t.end()
  })

  test('per-build temporary directory', function (t) {
    makeComponent()
    t.equal(component.getTmpDir(), perBuildTmpDir, 'gets passed through')
    t.end()
  })

  t.end()
})
