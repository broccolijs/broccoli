'use strict';

const RSVP = require('rsvp');
const chai = require('chai');
const childProcess = require('child_process');
const fs = require('fs');
const rimraf = require('rimraf');
const sinon = require('sinon').createSandbox();
const sinonChai = require('sinon-chai');

const Builder = require('../lib/builder');
const DummyWatcher = require('../lib/dummy-watcher');
const broccoli = require('../lib/index');
const cli = require('../lib/cli');
const loadBrocfile = require('../lib/load_brocfile');

chai.use(sinonChai);

describe('cli', function() {
  let oldCwd = null;
  let exitStub;
  let execSyncStub;

  beforeEach(function() {
    execSyncStub = sinon.stub(childProcess, 'execSync');
    execSyncStub.throws();
    exitStub = sinon.stub(process, 'exit');
    oldCwd = process.cwd();
    process.chdir('test/fixtures/project/subdir');
  });

  afterEach(function() {
    sinon.restore();
    process.chdir(oldCwd);
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  describe('build', function() {
    afterEach(function() {
      rimraf.sync('dist');
    });

    it('creates watcher with sane options', function() {
      const spy = createWatcherSpy();
      // --watch is passed so Watcher spy can be used
      return cli(['node', 'broccoli', 'build', 'dist', '--watch']).then(() =>
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: false,
              watchman: false,
              node: true,
            })
          )
        )
      );
    });

    context('on successful build', function() {
      it('cleanups tmp files', function() {
        const cleanup = sinon.spy(Builder.prototype, 'cleanup');
        return cli(['node', 'broccoli', 'build', 'dist']).then(() => {
          chai.expect(cleanup).to.be.calledOnce;
        });
      });

      it('closes process on completion', function() {
        return cli(['node', 'broccoli', 'build', 'dist']).then(() => {
          chai.expect(exitStub).to.be.calledWith(0);
        });
      });

      it('creates output folder', function() {
        return cli(['node', 'broccoli', 'build', 'dist']).then(() => {
          chai.expect(fs.existsSync('dist')).to.be.true;
        });
      });
    });

    context('with param --watch', function() {
      it('starts watcher', function(done) {
        sinon.stub(broccoli.Watcher.prototype, 'start').value(() => done());
        cli(['node', 'broccoli', 'build', 'dist', '--watch']);
      });
    });

    context('with param --watcher', function() {
      it('closes process on completion', function() {
        return cli(['node', 'broccoli', 'build', 'dist', '--watcher', 'polling']).then(() =>
          chai.expect(exitStub).to.be.calledWith(0)
        );
      });

      it('creates watcher with sane options for polling', function() {
        const spy = createWatcherSpy();
        return cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'polling']).then(
          () =>
            chai.expect(spy).to.have.been.calledWith(
              sinon.match.instanceOf(Builder),
              sinon.match.has(
                'saneOptions',
                sinon.match({
                  poll: true,
                  watchman: false,
                  node: false,
                })
              )
            )
        );
      });

      it('creates watcher with sane options for watching', function() {
        const spy = createWatcherSpy();
        return cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'watchman']).then(
          () =>
            chai.expect(spy).to.have.been.calledWith(
              sinon.match.instanceOf(Builder),
              sinon.match.has(
                'saneOptions',
                sinon.match({
                  poll: false,
                  watchman: true,
                  node: false,
                })
              )
            )
        );
      });

      it('creates watcher with sane options for node', function() {
        const spy = createWatcherSpy();
        return cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'node']).then(() =>
          chai.expect(spy).to.have.been.calledWith(
            sinon.match.instanceOf(Builder),
            sinon.match.has(
              'saneOptions',
              sinon.match({
                poll: false,
                watchman: false,
                node: true,
              })
            )
          )
        );
      });
    });

    context('with param --brocfile-path', function() {
      it('closes process on completion', function() {
        return cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']).then(
          () => chai.expect(exitStub).to.be.calledWith(0)
        );
      });

      it('loads brocfile from a path', function() {
        const spy = sinon.spy(loadBrocfile);
        sinon.stub(broccoli, 'loadBrocfile').value(spy);
        return cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']).then(
          () => chai.expect(spy).to.be.calledWith('../Brocfile.js')
        );
      });
    });

    context('with param --output-path', function() {
      it('closes process on completion', function() {
        return cli(['node', 'broccoli', 'build', '--output-path', 'dist']).then(() => {
          chai.expect(exitStub).to.be.calledWith(0);
        });
      });

      it('creates output folder', function() {
        return cli(['node', 'broccoli', 'build', '--output-path', 'dist']).then(() => {
          chai.expect(fs.existsSync('dist')).to.be.true;
        });
      });

      context('and with [target]', function() {
        it('exits with error', function() {
          return cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist']).then(() => {
            chai.expect(exitStub).to.be.calledWith(1);
          });
        });

        it('outputs error reason to console', function() {
          const consoleMock = sinon.mock(console);
          consoleMock
            .expects('error')
            .once()
            .withArgs('option --output-path and [target] cannot be passed at same time');
          cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist']);
          consoleMock.verify();
        });
      });
    });
  });

  describe('serve', function() {
    let server;

    beforeEach(function() {
      server = sinon.mock(broccoli.server);
    });

    context('creates Watcher with sane options', function() {
      it('without watchman installed it defaults to node', function() {
        sinon.stub(broccoli, 'server').value({ serve() {} });
        const spy = createWatcherSpy();
        // --watch is passed so Watcher spy can be used
        return cli(['node', 'broccoli', 'serve']).then(() =>
          chai.expect(spy).to.have.been.calledWith(
            sinon.match.instanceOf(Builder),
            sinon.match.has(
              'saneOptions',
              sinon.match({
                poll: false,
                watchman: false,
                node: true,
              })
            )
          )
        );
      });

      it('with watchman installed it defaults to watchman', function() {
        execSyncStub.returns(JSON.stringify({ version: '4.7.0' }));
        sinon.stub(broccoli, 'server').value({ serve() {} });
        const spy = createWatcherSpy();
        // --watch is passed so Watcher spy can be used
        return cli(['node', 'broccoli', 'serve']).then(() =>
          chai.expect(spy).to.have.been.calledWith(
            sinon.match.instanceOf(Builder),
            sinon.match.has(
              'saneOptions',
              sinon.match({
                poll: false,
                watchman: true,
                node: false,
              })
            )
          )
        );
      });
    });

    it('should start a server with default values', function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.instanceOf(broccoli.Watcher), sinon.match.string, sinon.match.number);
      cli(['node', 'broccoli', 'serve']);
      server.verify();
    });

    it('supports `s` alias', function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.any, sinon.match.string, sinon.match.number);
      cli(['node', 'broccoli', 's']);
      server.verify();
    });

    it('starts server with given ip adress', function() {
      server.expects('serve').withArgs(sinon.match.any, '192.168.2.123', sinon.match.number);
      cli(['node', 'broccoli', 'serve', '--host', '192.168.2.123']);
      server.verify();
    });

    it('converts port to a number and starts the server at given port', function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.any, sinon.match.string, 1234);
      cli(['node', 'broccoli', 'serve', '--port', '1234']);
      server.verify();
    });

    it('converts port to a number and starts the server at given port and host', function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.any, '192.168.2.123', 1234);
      cli(['node', 'broccoli', 'serve', '--port=1234', '--host=192.168.2.123']);
      server.verify();
    });

    context('with param --brocfile-path', function() {
      it('starts serve', function() {
        server
          .expects('serve')
          .once()
          .withArgs(sinon.match.any, sinon.match.string, sinon.match.number);
        cli(['node', 'broccoli', 'serve', '--brocfile-path', '../Brocfile.js']);
        server.verify();
      });

      it('loads brocfile from a path', function() {
        const spy = sinon.spy(loadBrocfile);
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(spy);
        cli(['node', 'broccoli', 'serve', '--brocfile-path', '../Brocfile.js']);
        chai.expect(spy).to.be.calledWith('../Brocfile.js');
      });
    });

    context('with param --output-path', function() {
      afterEach(function() {
        rimraf.sync('dist');
      });

      it('creates output folder', function(done) {
        let watcher;
        sinon.stub(broccoli, 'server').value({
          serve(_watcher) {
            watcher = _watcher;
            _watcher.start();
          },
        });
        cli(['node', 'broccoli', 'serve', '--output-path', 'dist']);
        watcher.on('buildSuccess', function() {
          chai.expect(fs.existsSync('dist')).to.be.true;
          watcher.quit();
          done();
        });
      });

      context('and with folder already existing', function() {
        it('exits with error', function() {
          sinon.stub(broccoli, 'server').value({ serve() {} });
          return cli(['node', 'broccoli', 'serve', '--output-path', 'subdir']).then(() => {
            chai.expect(exitStub).to.be.calledWith(1);
          });
        });

        it('outputs error reason to console', function() {
          const consoleMock = sinon.mock(console);
          consoleMock
            .expects('error')
            .once()
            .withArgs('subdir/ already exists; we cannot build into an existing directory');

          sinon.stub(broccoli, 'server').value({ serve() {} });
          return cli(['node', 'broccoli', 'serve', '--output-path', 'subdir']).then(() => {
            consoleMock.verify();
          });
        });
      });
    });

    context('with param --no-watch', function() {
      it('should start a server with default values', function() {
        server
          .expects('serve')
          .once()
          .withArgs(sinon.match.instanceOf(DummyWatcher), sinon.match.string, sinon.match.number);
        cli(['node', 'broccoli', 'serve', '--no-watch']);
        server.verify();
      });
    });
  });

  context('with param --watcher', function() {
    it('creates watcher with sane options for polling', function() {
      sinon.stub(broccoli, 'server').value({ serve() {} });
      const spy = createWatcherSpy();
      return cli(['node', 'broccoli', 'serve', '--watcher', 'watchman']).then(() =>
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: false,
              watchman: true,
              node: false,
            })
          )
        )
      );
    });

    it('creates watcher with sane options for polling', function() {
      sinon.stub(broccoli, 'server').value({ serve() {} });
      const spy = createWatcherSpy();
      return cli(['node', 'broccoli', 'serve', '--watcher', 'node']).then(() =>
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: false,
              watchman: false,
              node: true,
            })
          )
        )
      );
    });

    it('creates watcher with sane options for polling', function() {
      sinon.stub(broccoli, 'server').value({ serve() {} });
      const spy = createWatcherSpy();
      return cli(['node', 'broccoli', 'serve', '--watcher', 'polling']).then(() =>
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: true,
              watchman: false,
              node: false,
            })
          )
        )
      );
    });
  });
});

function createWatcherSpy() {
  const spy = sinon.spy();
  sinon.stub(broccoli, 'Watcher').value(
    class Watcher extends DummyWatcher {
      constructor(builder, options) {
        super(builder, options);
        spy.call(null, builder, options);
      }

      start() {
        return RSVP.resolve();
      }
    }
  );
  return spy;
}
