var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var synchronized = require('synchronized')


exports.Builder = Builder
function Builder (options) {
  var self = this

  this.reader = options.reader
  this.transformer = options.transformer

  var tmpBaseDir = options.tmpDir || '.'
  mkdirp.sync(tmpBaseDir)
  this.tmpDir = mktemp.createDirSync(path.join(tmpBaseDir, 'broccoli-XXXXXX.tmp'))
  process.on('exit', function () {
    self.cleanupTmpDir()
  })

  this.cacheDir = path.join(this.tmpDir, 'cache.tmp')
  fs.mkdirSync(this.cacheDir)

  this.buildScheduled = false
}

// outputDir is optional
Builder.prototype.build = function (outputDir, callback) {
  var self = this

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
      done()
      if (callback != null) callback()
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
