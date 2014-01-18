var fs = require('fs')
var path = require('path')
var domain = require('domain')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var synchronized = require('synchronized')

var readers = require('./readers')


exports.Builder = Builder
function Builder () {
  if (arguments.length) throw new Error('Constructor arguments not supported') // remove me soon

  var self = this

  this.baseDir = '.' // should perhaps not rely on cwd

  this.tmpDir = mktemp.createDirSync(path.join(this.baseDir, '.broccoli-XXXXXX.tmp'))
  process.on('exit', function () {
    self.cleanupTmpDir()
  })

  this.cacheDir = path.join(this.tmpDir, 'cache.tmp')
  fs.mkdirSync(this.cacheDir)

  this.buildScheduled = false
}

Builder.prototype.getReader = function () {
  if (this._reader == null) this._reader = new readers.TreeReader()
  return this._reader
}

Builder.prototype.addTrees = function (trees) {
  this.getReader().addTrees(trees)
  return this
}

Builder.prototype.addBower = function () {
  this.getReader().addBower()
  return this
}

Builder.prototype.addTransformer = function (transformer) {
  if (this.transformer != null) throw new Error('Multiple transformers not yet supported')
  this.transformer = transformer
  return this
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
    var d = domain.create()
    d.on('error', function (err) {
      // The domain documentation says that continuing to run is bad practice
      // and that we leak resources. On the other hand, we generally don't
      // want our server to go down, ever. We should investigate.
      finish(err)
    })
    d.run(function () {
      // Without setImmediate, while a synchronous exception inside this
      // function would still be caught, any code after builder.build() would
      // not run.
      setImmediate(function () {
        self.getReader().setup({
          tmpDir: self.buildTmpDir,
          cacheDir: self.cacheDir
        })
        self.getReader().read(readerDest)
          .then(function () {
            self.transformer.setup({
              tmpDir: self.buildTmpDir,
              cacheDir: self.cacheDir
            })
            return self.transformer.transform(readerDest, outputDir)
          })
          .then(function () {
            finish()
          }, function (err) {
            finish(err)
          })
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
