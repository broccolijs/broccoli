var fs = require('fs')
var path = require('path')
var domain = require('domain')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var synchronized = require('synchronized')
var RSVP = require('rsvp')
var ncp = require('ncp')

var TmpDirManager = require('./tmp_dir_manager').TmpDirManager

ncp.limit = 1


exports.Builder = Builder
function Builder (injector, tree) {
  var self = this

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

    self.tmpDirManager.cleanup() // remove last build's directories

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
        var setupOptions = {
        }
        self.tree.setup(setupOptions)

        return self.tree.withTimer(function () {
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
            finish()
          }, function (err) {
            finish(err)
          })
      })
    })

    function finish (err) {
      // Watch out - errors in here will not be caught
      self.buildError = err
      self.tree.teardown()
      try {
        console.log('Built ' + (err ? 'with error ' : ''))
        console.log(self.tree.formatTimings(2))
      } catch (err) {
        console.error(err)
      }
      done()
      if (callback != null) callback()
    }
  })
}
