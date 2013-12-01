var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var synchronized = require('synchronized')


exports.Builder = Builder
function Builder (options) {
  var self = this

  this.reader = options.reader
  this.transformer = options.transformer

  this.tmpDir = mktemp.createDirSync('broccoli-XXXXXX.tmp')
  process.on('exit', function () {
    self.cleanupTmpDir()
  })

  this.cacheDir = path.join(this.tmpDir, 'cache.tmp')
  fs.mkdirSync(this.cacheDir)

  // Debounce logic; should probably be extracted, or better, made unnecessary
  this.postBuildLock = {}
  this.buildScheduled = false
  this.lockReleaseTimer = null
  this.lockReleaseFunction = null
  this.lockReleaseFirstScheduledAt = null
}

// outputDir is optional
Builder.prototype.build = function (outputDir, callback) {
  var self = this

  var debounceDelay = 0
  if (outputDir == null) {
    // We are watching and serving; refactor this logic
    debounceDelay = 100
  }

  function scheduleLockReleaseTimer () {
    if (!self.lockReleaseFirstScheduledAt) self.lockReleaseFirstScheduledAt = Date.now()
    self.lockReleaseTimer = setTimeout(self.lockReleaseFunction, debounceDelay)
  }

  if (self.lockReleaseTimer && Date.now() < self.lockReleaseFirstScheduledAt + 1000) {
    // Reschedule running timer because we keep getting events, but never put
    // off more than 1000 milliseconds in total
    clearTimeout(self.lockReleaseTimer)
    scheduleLockReleaseTimer()
  }

  if (this.buildScheduled) return
  this.buildScheduled = true

  synchronized(this, function (done) {
    self.buildScheduled = false

    var startTime = Date.now()

    self.buildError = null

    self.cleanupBuildProducts() // remove last build's directories
    if (outputDir == null) {
      self.outputTmpDir = mktemp.createDirSync(path.join(self.tmpDir, 'output-XXXXXX.tmp'))
      outputDir = self.outputTmpDir
    }
    self.buildTmpDir = mktemp.createDirSync(path.join(self.tmpDir, 'build-XXXXXX.tmp'))

    var readerDest = mktemp.createDirSync(path.join(self.buildTmpDir, 'reader-XXXXXX.tmp'))
    self.reader._setup({
      tmpDir: self.buildTmpDir,
      cacheDir: self.cacheDir
    })
    self.reader.read(readerDest, function (err) {
      if (err) {
        finish(err)
        return
      }
      self.transformer._setup({
        tmpDir: self.buildTmpDir,
        cacheDir: self.cacheDir
      })
      self.transformer.transform(readerDest, outputDir, function (err) {
        finish(err)
      })
    })

    function finish (err) {
      if (err) self.buildError = err
      console.log('Built ' + (err ? 'with error ' : '') + '(' + (Date.now() - startTime) + ' ms)')
      releaseAfterDelay()
    }

    function releaseAfterDelay () {
      self.lockReleaseFunction = function () {
        self.lockReleaseTimer = null
        self.lockReleaseFunction = null
        self.lockReleaseFirstScheduledAt = null
        done()
        if (callback != null) callback()
      }
      scheduleLockReleaseTimer()
    }
  })
}

Builder.prototype.cleanupTmpDir = function (exitCode) {
  if (this.tmpDir != null) {
    rimraf.sync(this.tmpDir)
  }
}

Builder.prototype.cleanupBuildProducts = function () {
  var fields = ['buildTmpDir', 'outputTmpDir']
  for (var i = 0; i < fields.length; i++) {
    if (this[fields[i]] != null) {
      rimraf.sync(this[fields[i]])
      this[fields[i]] = null
    }
  }
}
