var synchronized = require('synchronized')
var RSVP = require('rsvp')
var ncp = require('ncp')

var TmpDirManager = require('./tmp_dir_manager').TmpDirManager

ncp.limit = 1


exports.Builder = Builder
function Builder (injector, tree) {
  this.injector = injector
  this.tmpDirManager = injector.get(TmpDirManager)
  this.baseDir = '.' // should perhaps not rely on cwd
  this.tree = tree

  this.buildScheduled = false
}

// outputDir is optional
Builder.prototype.build = function (outputDir, callback) {
  var self = this

  if (this.buildScheduled) return
  this.buildScheduled = true

  synchronized(this, function (done) {
    self.buildScheduled = false

    self.buildError = null

    return RSVP.resolve()
      .then(function () {
        self.tmpDirManager.cleanup() // remove last build's directories
        return self.tree.read()
      })
      .then(function (dir) {
        self.outputTmpDir = dir
        // This should be moved into the `build` command
        if (outputDir != null) {
          // This takes ~10ms per MB. It seems acceptable since it's only
          // used for one-off builds.
          return RSVP.denodeify(ncp)(dir, outputDir, {
            clobber: false,
            stopOnErr: true
          })
        }
      })
      .then(function () {
        console.log('Built')
      }, function (err) {
        self.buildError = err
        console.log('Built with error')
      })
      .finally(function () {
        done()
        if (callback != null) callback()
      })
  })
}
