'use strict'

var fs = require('fs')
var RSVP = require('rsvp')
var tmp = require('tmp')
var sinon = require('sinon')
var chai = require('chai'), expect = chai.expect
var chaiAsPromised = require('chai-as-promised'); chai.use(chaiAsPromised)
var sinonChai = require('sinon-chai'); chai.use(sinonChai)
// We require broccoli-plugin and broccoli-source directly rather than using
// multidep so that this file is usable as a dependency
var Plugin = require('broccoli-plugin')
var WatchedDir = require('broccoli-source').WatchedDir
var plugins = require('./plugins')(Plugin)

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup()

// Parameters:
//
// Watcher: The Watcher class you wish to test
// Builder: The broccoli.Builder class
// sleepDuration: Your Watcher class should reliably pick up
//     changes to the file system within `sleepDuration` milliseconds.
// tmpBaseDir: A watcher_test.tmp directory will be created and deleted
//     underneath this directory; e.g. if you pass 'test', the directory
//     will be test/watcher_test.tmp
//
// Requires mocha for describe/it syntax.

module.exports = function(Watcher, Builder, sleepDuration) {
  function sleep() {
    return new RSVP.Promise(function(resolve, reject) {
      setTimeout(resolve, sleepDuration)
    })
  }

  describe('Watcher', function() {
    if (/^v0\.10\./.test(process.version)) {
      // No subsecond mtime resolution on Node 0.10
      sleepDuration = Math.max(1100, sleepDuration)
      this.timeout(20000)
    }
    if (process.env.CI) {
      this.timeout(120000)
    }

    var builder, buildSpy, watcher, watchPromise

    afterEach(function() {
      return RSVP.resolve()
        .then(function() {
          if (watcher) {
            return watcher.quit()
          }
        })
        .then(function() {
          watcher = null
          if (builder) {
            builder.cleanup()
            builder = null
          }
          buildSpy = null
        })
    })

    var tmpDir, tmpRemoveCallback

    beforeEach(function() {
      var tmpObj = tmp.dirSync({ prefix: 'broccoli_watcher_test-', unsafeCleanup: true })
      tmpDir = tmpObj.name
      tmpRemoveCallback = tmpObj.removeCallback
    })
    afterEach(function() {
      tmpRemoveCallback()
    })

    function makeNodeWithTwoWatchedDirectories() {
      fs.mkdirSync(tmpDir + '/1')
      fs.mkdirSync(tmpDir + '/1/subdir')
      fs.writeFileSync(tmpDir + '/1/subdir/foo', 'x')
      fs.mkdirSync(tmpDir + '/2')
      return new plugins.NoopPlugin([
        new WatchedDir(tmpDir + '/1'),
        new WatchedDir(tmpDir + '/2')
      ])
    }

    function setUpBuilderAndWatcher(node) {
      builder = new Builder(node)
      buildSpy = sinon.spy(builder, 'build')
      watcher = new Watcher(builder)
      watchPromise = watcher.watch()
    }

    function triggersRebuild(cb) {
      // watcher.currentBuild should exist immediately, and the Watcher should
      // trigger an initial build before any changes happen
      return watcher.currentBuild
        .then(function() {
          expect(buildSpy).to.have.callCount(1)
        })
        .then(sleep) // delay cb execution so mtimes differ
        .then(cb)
        .then(sleep)
        .then(function() {
          expect(buildSpy.callCount).to.be.within(1, 2)
          return buildSpy.callCount === 2
        })
    }

    describe('watching', function() {
      it('does not trigger rebuild when no files change', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() { })).to.be.eventually.false
      })

      it('triggers rebuild when adding files', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.writeFileSync(tmpDir + '/1/subdir/bar', 'hello')
        })).to.be.eventually.true
      })

      it('triggers rebuild when removing files', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.unlinkSync(tmpDir + '/1/subdir/foo')
        })).to.be.eventually.true
      })

      it('triggers rebuild when changing files', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.writeFileSync(tmpDir + '/1/subdir/foo', 'y')
        })).to.be.eventually.true
      })

      it('triggers rebuild when adding empty directories', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.mkdirSync(tmpDir + '/1/another-subdir')
        })).to.be.eventually.true
      })
    })

    describe('watcher.currentBuild', function() {
      it('is fulfilled when the build succeeds', function() {
        setUpBuilderAndWatcher(new plugins.NoopPlugin)
        return expect(watcher.currentBuild).to.be.fulfilled
      })

      it('is rejected when the build fails', function() {
        setUpBuilderAndWatcher(new plugins.FailingPlugin(new Error('fail me')))
        return expect(watcher.currentBuild).to.be.rejected
      })
    })

    it('builds exactly once if it has no watched directories', function() {
      setUpBuilderAndWatcher(new plugins.NoopPlugin)
      return watcher.currentBuild
        .then(function() {
          expect(buildSpy).to.have.been.calledOnce
        })
        .then(sleep)
        .then(function() {
          expect(buildSpy).to.have.been.calledOnce
        })
    })

    describe('events', function() {
      var buildEventHasTriggered, changeEventHasTriggered, errorEventHasTriggered

      function buildAndRecordEvents(errOrNull) {
        buildEventHasTriggered = false
        changeEventHasTriggered = false
        errorEventHasTriggered = false

        var node = new plugins.AsyncPlugin
        builder = new Builder(node)
        watcher = new Watcher(builder)

        watcher.on('build', function() {
          buildEventHasTriggered = true
        })
        watcher.on('change', function() {
          changeEventHasTriggered = true
        })
        watcher.on('error', function(err) {
          errorEventHasTriggered = err
        })

        watcher.watch()

        return node.buildStarted
          .then(sleep)
          .then(function() {
            expect(buildEventHasTriggered).to.be.true
            expect(changeEventHasTriggered).to.be.false
            expect(errorEventHasTriggered).to.be.false
            node.finishBuild(errOrNull)
            return watcher.currentBuild.catch(function() { })
          })
      }

      it('receives a "change" event on successful build', function() {
        return buildAndRecordEvents()
          .then(function() {
            expect(changeEventHasTriggered).to.be.true
            expect(errorEventHasTriggered).to.be.false
          })
      })

      it('receives an "error" event on failed build', function() {
        return buildAndRecordEvents(new Error('some error'))
          .then(function() {
            expect(changeEventHasTriggered).to.be.false
            expect(errorEventHasTriggered).to.be.an.instanceof(Error)
          })
      })
    })

    describe('watcher.watch() promise', function() {
      it('is fulfilled when watcher.quit() is called', function() {
        setUpBuilderAndWatcher(new plugins.FailingPlugin) // even if build fails
        watcher.quit()
        return expect(watchPromise).to.be.fulfilled
      })

      // We could relax this in the future and turn missing source directories
      // into transient build errors, by always watching the parent
      // directories
      it('is rejected when a watched source directory does not exist', function() {
        setUpBuilderAndWatcher(new WatchedDir('doesnotexist'))
        return expect(watchPromise).to.be.rejected
      })
    })

    describe('watcher.quit()', function() {
      it('if no build is in progress, just stops watching and fulfills watch() promise', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return watcher.currentBuild
          .then(function() {
            var quitPromise = watcher.quit()
            // Must be a promise (that presumably fulfills immediately), even
            // though no build is in progress
            expect(quitPromise.then).to.be.a('function')
            return quitPromise
          })
          .then(function() {
            fs.writeFileSync(tmpDir + '/1/subdir/bar', 'hello')
          })
          .then(sleep)
          .then(function() {
            expect(buildSpy).to.have.been.calledOnce
          })
      })

      it('if a build is in progress, returns a promise until it finishes, then stops watching', function() {
        var node = new plugins.AsyncPlugin([makeNodeWithTwoWatchedDirectories()])
        setUpBuilderAndWatcher(node)

        var quitPromise
        var quitPromiseHasBeenFulfilled = false

        return node.buildStarted
          .then(function() {
            // Quit while node is being built
            quitPromise = watcher.quit().then(function() {
              quitPromiseHasBeenFulfilled = true
            })
          })
          .then(sleep)
          .then(function() {
            // .quit() promise should not be fulfilled until build has finished
            expect(quitPromiseHasBeenFulfilled).to.be.false
            node.finishBuild()
            return quitPromise
          })

          .then(function() {
            fs.writeFileSync(tmpDir + '/1/subdir/bar', 'hello')
          })
          .then(sleep)
          .then(function() {
            // No further rebuilds should happen, even if files change
            expect(buildSpy).to.have.been.calledOnce
          })
      })

      it('is fulfilled even if the build fails', function() {
        setUpBuilderAndWatcher(new plugins.FailingPlugin)
        return expect(watcher.quit()).to.be.fulfilled
      })
    })
  })
}
