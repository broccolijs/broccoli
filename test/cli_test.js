import chai from 'chai';
import fs from 'fs';
import rimraf from 'rimraf';
import childProcess from 'child_process';
import Sinon from 'sinon';
import sinonChai from 'sinon-chai';
import Builder from '../lib/builder';
import BuilderError from '../lib/errors/builder';
import DummyWatcher from '../lib/dummy-watcher';
import broccoli from '../lib/index';
import cli from '../lib/cli';
import loadBrocfile from '../lib/load_brocfile';

import MockUI from 'console-ui/mock';
import WatchDetector from 'watch-detector';

const sinon = Sinon.createSandbox();
chai.use(sinonChai);

function createWatcherSpy() {
  const spy = sinon.spy();
  sinon.stub(broccoli, 'Watcher').value(
    class Watcher extends DummyWatcher {
      constructor(builder, watchedSourceNodes, options) {
        super(builder, watchedSourceNodes, options);
        spy.call(null, builder, watchedSourceNodes, options);
      }

      async start() {}
      async quit() {}
    }
  );
  return spy;
}

describe('cli', function() {
  let oldCwd = null;
  let exitStub;

  beforeEach(function() {
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

    it('creates watcher with sane options', async function() {
      sinon
        .stub(WatchDetector.prototype, 'findBestWatcherOption')
        .value(() => ({ watcher: 'polling' }));
      const spy = createWatcherSpy();
      // --watch is passed so Watcher spy can be used
      await cli(['node', 'broccoli', 'build', 'dist', '--watch']);
      chai.expect(spy).to.have.been.calledWith(
        sinon.match.instanceOf(Builder),
        sinon.match.array,
        sinon.match.has(
          'saneOptions',
          sinon.match({
            poll: true,
            watchman: false,
            node: false,
          })
        )
      );
    });

    context('on successful build', function() {
      it('cleanups tmp files', async function() {
        const cleanup = sinon.spy(Builder.prototype, 'cleanup');
        await cli(['node', 'broccoli', 'build', 'dist']);
        chai.expect(cleanup).to.be.calledOnce;
      });

      it('closes process on completion', async function() {
        await cli(['node', 'broccoli', 'build', 'dist']);
        chai.expect(exitStub).to.be.calledWith(0);
      });

      it('creates output folder', async function() {
        await cli(['node', 'broccoli', 'build', 'dist']);
        chai.expect(fs.existsSync('dist')).to.be.true;
      });
    });

    context('on failed build', function() {
      it('closes process with exit code 1', async function() {
        sinon.stub(DummyWatcher.prototype, 'start').value(() => {
          throw new Error('Build failed');
        });

        await cli(['node', 'broccoli', 'build', 'dist']);
        chai.expect(exitStub).to.be.calledWith(1);
      });
    });

    context('overwrites existing [target]', function() {
      afterEach(() => {
        rimraf.sync('dist');
      });

      it('removes existing files', async function() {
        fs.mkdirSync('dist');
        fs.writeFileSync('dist/foo.txt', 'foo');

        await cli(['node', 'broccoli', 'build']);

        chai.expect(fs.existsSync('dist')).to.be.true;
        chai.expect(fs.existsSync('dist/foo.txt')).to.be.false;
      });

      it('errors if [target] is a parent directory', function() {
        const mockUI = new MockUI();
        cli(['node', 'broccoli', 'build', '../'], mockUI);
        chai
          .expect(mockUI.errors)
          .to.contain('build directory can not be the current or direct parent directory: ../');
      });

      // just to be safe ;)
      it('errors if [target] is a the root directory', function() {
        const mockUI = new MockUI();
        cli(['node', 'broccoli', 'build', '/'], mockUI);
        chai
          .expect(mockUI.errors)
          .to.contain('build directory can not be the current or direct parent directory: /');
        chai.expect(exitStub).to.be.calledWith(1);
      });
    });

    context('with param --watch', function() {
      it('starts watcher', function(done) {
        sinon.stub(broccoli.Watcher.prototype, 'start').value(() => done());
        cli(['node', 'broccoli', 'build', 'dist', '--watch']);
      });
    });

    context('with param --watcher', function() {
      it('closes process on completion', async function() {
        await cli(['node', 'broccoli', 'build', 'dist', '--watcher', 'polling']);
        chai.expect(exitStub).to.be.calledWith(0);
      });

      it('creates watcher with sane options for polling', async function() {
        const spy = createWatcherSpy();
        await cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'polling']);
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.array,
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: true,
              watchman: false,
              node: false,
            })
          )
        );
      });

      it('creates watcher with sane options for watchman', async function() {
        sinon.stub(childProcess, 'execSync').returns(JSON.stringify({ version: '4.0.0' }));
        const spy = createWatcherSpy();
        await cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'watchman']);
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.array,
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: false,
              watchman: true,
              node: false,
            })
          )
        );
      });

      it('creates watcher with sane options for node', async function() {
        const spy = createWatcherSpy();
        await cli(['node', 'broccoli', 'build', 'dist', '--watch', '--watcher', 'node']);
        chai.expect(spy).to.have.been.calledWith(
          sinon.match.instanceOf(Builder),
          sinon.match.array,
          sinon.match.has(
            'saneOptions',
            sinon.match({
              poll: false,
              watchman: false,
              node: true,
            })
          )
        );
      });
    });

    context('with param --brocfile-path', function() {
      it('closes process on completion', async function() {
        await cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']);
        chai.expect(exitStub).to.be.calledWith(0);
      });

      it('loads brocfile from a path', async function() {
        const spy = sinon.spy(loadBrocfile);
        sinon.stub(broccoli, 'loadBrocfile').value(spy);
        await cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('brocfilePath', '../Brocfile.js'));
      });

      context('and with param --cwd', function() {
        it('closes process on completion', async function() {
          await cli([
            'node',
            'broccoli',
            'build',
            'dist',
            '--cwd',
            '..',
            '--brocfile-path',
            '../../empty/Brocfile.js',
          ]);
          chai.expect(exitStub).to.be.calledWith(0);
        });
      });
    });

    context('with param --cwd', function() {
      it('throws BuilderError on wrong path', function() {
        chai
          .expect(() => cli(['node', 'broccoli', 'build', 'dist', '--cwd', '../../basic']))
          .to.throw(BuilderError, /Directory not found/);
      });
    });

    context('with param --environment', function() {
      it('defaults to --environment=development: { env: "development" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'build', 'dist']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'development'));
      });

      it('with --environment=production passes { env: "production" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'build', 'dist', '--environment=production']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });

      it('with -e production passes { env: "production" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'build', 'dist', '-e', 'production']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });

      it('aliases --dev to --environment=development', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'build', 'dist', '--dev']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'development'));
      });

      it('aliases --prod to --environment=production', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'build', 'dist', '--prod']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });
    });

    it('supports `b` alias', async function() {
      await cli(['node', 'broccoli', 'b']);
      chai.expect(exitStub).to.be.calledWith(0);
    });

    context('with param --output-path', function() {
      it('closes process on completion', async function() {
        await cli(['node', 'broccoli', 'build', '--output-path', 'dist']);
        chai.expect(exitStub).to.be.calledWith(0);
      });

      it('creates output folder', async function() {
        await cli(['node', 'broccoli', 'build', '--output-path', 'dist']);
        chai.expect(fs.existsSync('dist')).to.be.true;
      });

      context('and with [target]', function() {
        it('exits with error', function() {
          cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist']);
          chai.expect(exitStub).to.be.calledWith(1);
        });

        it('outputs error reason to console', function() {
          const mockUI = new MockUI();
          cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist'], mockUI);
          chai
            .expect(mockUI.errors)
            .to.contain('option --output-path and [target] cannot be passed at same time');
        });
      });
    });
  });

  describe('serve', function() {
    let server;

    beforeEach(function() {
      server = sinon.mock(broccoli.server);
    });

    it('creates watcher with sane options', async function() {
      sinon
        .stub(WatchDetector.prototype, 'findBestWatcherOption')
        .value(() => ({ watcher: 'polling' }));
      const spy = createWatcherSpy();
      // --watch is passed so Watcher spy can be used
      await cli(['node', 'broccoli', 'serve']);
      chai.expect(spy).to.have.been.calledWith(
        sinon.match.instanceOf(Builder),
        sinon.match.array,
        sinon.match.has(
          'saneOptions',
          sinon.match({
            poll: true,
            watchman: false,
            node: false,
          })
        )
      );
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

    it('starts server with given ip address', async function() {
      server.expects('serve').withArgs(sinon.match.any, '192.168.2.123', sinon.match.number);
      await cli(['node', 'broccoli', 'serve', '--host', '192.168.2.123']);
      server.verify();
    });

    it('converts port to a number and starts the server at given port', async function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.any, sinon.match.string, 1234);
      await cli(['node', 'broccoli', 'serve', '--port', '1234']);
      server.verify();
    });

    it('converts port to a number and starts the server at given port and host', async function() {
      server
        .expects('serve')
        .once()
        .withArgs(sinon.match.any, '192.168.2.123', 1234);
      await cli(['node', 'broccoli', 'serve', '--port=1234', '--host=192.168.2.123']);
      server.verify();
    });

    context('with param --brocfile-path', function() {
      it('starts serve', async function() {
        server
          .expects('serve')
          .once()
          .withArgs(sinon.match.any, sinon.match.string, sinon.match.number);
        await cli(['node', 'broccoli', 'serve', '--brocfile-path', '../Brocfile.js']);
        server.verify();
      });

      it('loads brocfile from a path', async function() {
        const spy = sinon.spy(loadBrocfile);
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(spy);
        await cli(['node', 'broccoli', 'serve', '--brocfile-path', '../Brocfile.js']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('brocfilePath', '../Brocfile.js'));
      });
    });

    context('with param --cwd', function() {
      it('throws BuilderError on wrong path', function() {
        chai
          .expect(() => cli(['node', 'broccoli', 'serve', '--cwd', '../../basic']))
          .to.throw(BuilderError, /Directory not found/);
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
        context('accepts --overwrite option', function() {
          afterEach(() => {
            rimraf.sync('dist');
          });

          it('overwrites existing files', function(done) {
            fs.mkdirSync('../dist');
            fs.writeFileSync('../dist/foo.txt', 'foo');

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
              chai.expect(fs.existsSync('dist/foo.txt')).to.be.false;
              watcher.quit();
              done();
            });
          });
        });

        it('errors if [target] is a parent directory', async function() {
          const mockUI = new MockUI();
          await cli(['node', 'broccoli', 'build', '../'], mockUI);
          chai
            .expect(mockUI.errors)
            .to.contain('build directory can not be the current or direct parent directory: ../');
        });
      });
    });

    context('with param --no-watch', function() {
      it('should start a server with default values', async function() {
        server
          .expects('serve')
          .once()
          .withArgs(sinon.match.instanceOf(DummyWatcher), sinon.match.string, sinon.match.number);
        await cli(['node', 'broccoli', 'serve', '--no-watch']);
        server.verify();
      });
    });

    context('with param --environment', function() {
      it('defaults to --environment=development: { env: "development" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'serve']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'development'));
      });

      it('with --environment=production passes { env: "production" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'serve', '--environment=production']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });

      it('with -e production passes { env: "production" }', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'serve', '-e', 'production']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });

      it('aliases --dev to --environment=development', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'serve', '--dev']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'development'));
      });

      it('aliases --prod to --environment=production', async function() {
        const spy = sinon.spy(loadBrocfile());
        sinon.stub(broccoli, 'server').value({ serve() {} });
        sinon.stub(broccoli, 'loadBrocfile').value(() => spy);

        await cli(['node', 'broccoli', 'serve', '--prod']);
        chai.expect(spy).to.be.calledWith(sinon.match.has('env', 'production'));
      });
    });
  });

  context('with param --watcher', function() {
    it('creates watcher with sane options for watchman', async function() {
      sinon.stub(childProcess, 'execSync').returns(JSON.stringify({ version: '4.0.0' }));
      const spy = createWatcherSpy();
      await cli(['node', 'broccoli', 'serve', '--watcher', 'watchman']);
      chai.expect(spy).to.have.been.calledWith(
        sinon.match.instanceOf(Builder),
        sinon.match.array,
        sinon.match.has(
          'saneOptions',
          sinon.match({
            poll: false,
            watchman: true,
            node: false,
          })
        )
      );
    });

    it('creates watcher with sane options for node', async function() {
      const spy = createWatcherSpy();
      await cli(['node', 'broccoli', 'serve', '--watcher', 'node']);
      chai.expect(spy).to.have.been.calledWith(
        sinon.match.instanceOf(Builder),
        sinon.match.array,
        sinon.match.has(
          'saneOptions',
          sinon.match({
            poll: false,
            watchman: false,
            node: true,
          })
        )
      );
    });

    it('creates watcher with sane options for polling', async function() {
      const spy = createWatcherSpy();
      await cli(['node', 'broccoli', 'serve', '--watcher', 'polling']);
      chai.expect(spy).to.have.been.calledWith(
        sinon.match.instanceOf(Builder),
        sinon.match.array,
        sinon.match.has(
          'saneOptions',
          sinon.match({
            poll: true,
            watchman: false,
            node: false,
          })
        )
      );
    });
  });
});
