var fs = require('fs')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var synchronized = require('synchronized')


exports.Builder = Builder
function Builder (options) {
  var self = this

  this.reader = options.reader
  this.compilerCollection = options.compilerCollection

  this.tmpDir = mktemp.createDirSync('broccoli-XXXXXX.tmp')
  process.on('exit', function () {
    self.cleanupTmpDir()
  })

  this.cacheDir = this.tmpDir + '/cache.tmp'
  fs.mkdirSync(this.cacheDir)

  // Debounce logic; should probably be extracted
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
      self.outputTmpDir = mktemp.createDirSync(self.tmpDir + '/output-XXXXXX.tmp')
      outputDir = self.outputTmpDir
    }

    var readerDest = mktemp.createDirSync(self.tmpDir + '/reader-XXXXXX.tmp')
    self.reader._setup({
      tmpDir: self.tmpDir, // should be a subdirectory so we can clean
      cacheDir: self.cacheDir
    })
    self.reader.read(readerDest, function (err) {
      if (err) {
        finish(err)
        return
      }
      self.compilerCollection._setup({
        tmpDir: self.tmpDir, // should be a subdirectory so we can clean
        cacheDir: self.cacheDir
      })
      self.compilerCollection.run(readerDest, outputDir, function (err) {
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
  var self = this
  // This needs updating for component-based architecture
  ;['preprocessDest', 'outputTmpDir'].forEach(function (field) {
    if (self[field] != null) {
      rimraf(self[field], function (err) {
        if (err) throw err
      })
      self[field] = null
    }
  })
}
