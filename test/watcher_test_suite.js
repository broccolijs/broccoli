'use strict'

var fs = require('fs')
var rimraf = require('rimraf')
var RSVP = require('rsvp')
var sinon = require('sinon')
var chai = require('chai'), expect = chai.expect
var chaiAsPromised = require('chai-as-promised'); chai.use(chaiAsPromised)
var sinonChai = require('sinon-chai'); chai.use(sinonChai)
// We require broccoli-plugin and broccoli-source directly rather than using
// multidep so that this file is usable as a dependency
var Plugin = require('broccoli-plugin')
var WatchedDir = require('broccoli-source').WatchedDir
var plugins = require('./plugins')(Plugin)


// Pass in the Watcher class you wish to test, as well as broccoli.Builder and
// a sleepDuration in milliseconds. Your Watcher class should reliably pick up
// changes within `sleepDuration` milliseconds.
//
// Requires mocha for describe/it syntax.

module.exports = function(Watcher, Builder, sleepDuration) {
  function sleep() {
    return new RSVP.Promise(function(resolve, reject) {
      setTimeout(resolve, sleepDuration)
    })
  }

  describe('Watcher', function() {
    var builder, buildSpy, watcher

    beforeEach(function() {
      rimraf.sync('test/tmp')
      fs.mkdirSync('test/tmp')
    })

    afterEach(function() {
      return RSVP.resolve()
        .then(function() {
          if (watcher) {
            var promise = watcher.quit()
            watcher = null
            return promise.catch(function(err) {})
          }
        })
        .then(function() {
          if (builder) {
            builder.cleanup()
            builder = null
          }
          buildSpy = null
          rimraf.sync('test/tmp')
        })
    })

    function makeNodeWithTwoWatchedDirectories() {
      fs.mkdirSync('test/tmp/1')
      fs.mkdirSync('test/tmp/1/subdir')
      fs.writeFileSync('test/tmp/1/subdir/foo', 'x')
      fs.mkdirSync('test/tmp/2')
      return new plugins.NoopPlugin([
        new WatchedDir('test/tmp/1'),
        new WatchedDir('test/tmp/2')
      ])
    }

    function setUpBuilderAndWatcher(node) {
      builder = new Builder(node)
      buildSpy = sinon.spy(builder, 'build')
      watcher = new Watcher(builder)
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
          fs.writeFileSync('test/tmp/1/subdir/bar', 'hello')
        })).to.be.eventually.true
      })

      it('triggers rebuild when removing files', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.unlinkSync('test/tmp/1/subdir/foo')
        })).to.be.eventually.true
      })

      it('triggers rebuild when changing files', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.writeFileSync('test/tmp/1/subdir/foo', 'y')
        })).to.be.eventually.true
      })

      it('triggers rebuild when adding empty directories', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return expect(triggersRebuild(function() {
          fs.mkdirSync('test/tmp/1/another-subdir')
        })).to.be.eventually.true
      })
    })

    describe('Watcher.currentBuild', function() {
      it ('is fulfilled when the build succeeds', function() {
        setUpBuilderAndWatcher(new plugins.NoopPlugin)
        return expect(watcher.currentBuild).to.be.fulfilled
      })

      it ('is rejected when the build fails', function() {
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
      var changeEventHasTriggered, errorEventHasTriggered

      function buildAndRecordEvents(errOrNull) {
        changeEventHasTriggered = errorEventHasTriggered = false

        var node = new plugins.AsyncPlugin
        setUpBuilderAndWatcher(node)

        watcher.on('change', function() {
          changeEventHasTriggered = true
        })
        watcher.on('error', function(err) {
          errorEventHasTriggered = err
        })

        return node.buildStarted
          .then(sleep)
          .then(function() {
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

    describe('watcher.quit()', function() {
      it('stops watching', function() {
        setUpBuilderAndWatcher(makeNodeWithTwoWatchedDirectories())
        return watcher.currentBuild
          .then(function() {
            expect(buildSpy).to.have.been.calledOnce
            return watcher.quit()
          })
          .then(function() {
            fs.writeFileSync('test/tmp/1/subdir/bar', 'hello')
          })
          .then(sleep)
          .then(function() {
            expect(buildSpy).to.have.been.calledOnce
          })
      })

      it('returns a promise until the current rebuild has finished', function() {
        var node = new plugins.AsyncPlugin
        setUpBuilderAndWatcher(node)

        var quitPromise
        var quitPromiseHasBeenFulfilled = false

        return node.buildStarted
          .then(function() {
            quitPromise = watcher.quit().then(function() {
              quitPromiseHasBeenFulfilled = true
            })
          })
          .then(sleep)
          .then(function() {
            expect(quitPromiseHasBeenFulfilled).to.be.false
            node.finishBuild()
            return quitPromise
          })
      })

      it('is fulfilled even if the build fails', function() {
        setUpBuilderAndWatcher(new plugins.FailingPlugin)
        return expect(watcher.quit()).to.be.fulfilled
      })
    })
  })
}
