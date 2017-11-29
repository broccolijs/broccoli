'use strict';

const chai = require('chai');
const fs = require('fs');
const rimraf = require('rimraf');
const sinon = require('sinon').createSandbox();
const sinonChai = require('sinon-chai');

const Builder = require('../lib/builder');
const broccoli = require('../lib/index');
const cli = require('../lib/cli');
const loadBrocfile = require('../lib/load_brocfile');

chai.use(sinonChai);

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
  });

  describe('build', function() {
    afterEach(function() {
      rimraf.sync('dist');
    });

    context('on successful build', function() {
      it('cleanups tmp files', function(done) {
        const cleanup = sinon.spy(Builder.prototype, 'cleanup');

        cli(['node', 'broccoli', 'build', 'dist']);

        process.nextTick(() => {
          chai.expect(cleanup).to.be.calledOnce;
          done();
        });
      });

      it('closes process on completion', function(done) {
        cli(['node', 'broccoli', 'build', 'dist']);

        process.nextTick(() => {
          chai.expect(exitStub).to.be.calledWith(0);
          done();
        });
      });

      it('creates output folder', function(done) {
        cli(['node', 'broccoli', 'build', 'dist']);
        process.nextTick(() => {
          chai.expect(fs.existsSync('dist')).to.be.true;
          done();
        });
      });
    });

    context('with param --brocfile-path', function() {
      it('closes process on completion', function(done) {
        cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']);

        process.nextTick(() => {
          chai.expect(exitStub).to.be.calledWith(0);
          done();
        });
      });

      it('loads brocfile from a path', function() {
        const spy = sinon.spy(loadBrocfile);
        sinon.stub(broccoli, 'loadBrocfile').value(spy);
        cli(['node', 'broccoli', 'build', 'dist', '--brocfile-path', '../Brocfile.js']);
        chai.expect(spy).to.be.calledWith('../Brocfile.js');
      });
    });

    context('with param --output-path', function() {
      it('closes process on completion', function(done) {
        cli(['node', 'broccoli', 'build', '--output-path', 'dist']);

        process.nextTick(() => {
          chai.expect(exitStub).to.be.calledWith(0);
          done();
        });
      });

      it('creates output folder', function(done) {
        cli(['node', 'broccoli', 'build', '--output-path', 'dist']);
        process.nextTick(() => {
          chai.expect(fs.existsSync('dist')).to.be.true;
          done();
        });
      });

      context('and with [target]', function() {
        it('exits with error', function(done) {
          cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist']);
          process.nextTick(() => {
            chai.expect(exitStub).to.be.calledWith(1);
            done();
          });
        });

        it('outputs error reason to console', function(done) {
          const consoleMock = sinon.mock(console);
          consoleMock
            .expects('error')
            .once()
            .withArgs('option --output-path and [target] cannot be passed at same time');

          cli(['node', 'broccoli', 'build', 'dist', '--output-path', 'dist']);

          process.nextTick(() => {
            consoleMock.verify();
            done();
          });
        });
      });
    });
  });

  describe('serve', function() {
    let server;

    beforeEach(function() {
      server = sinon.mock(broccoli.server);
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

    context('on terminated watcher', function() {
      it('by SIGTERM exits without error', function(done) {
        cli(['node', 'broccoli', 'serve']);
        process.nextTick(() => {
          process.kill(process.pid, 'SIGTERM');
          setTimeout(() => {
            chai.expect(exitStub).to.be.calledWith(0);
            done();
          }, 200);
        });
      });
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
        it('exits with error', function(done) {
          sinon.stub(broccoli, 'server').value({ serve() {} });
          cli(['node', 'broccoli', 'serve', '--output-path', 'subdir']);
          process.nextTick(() => {
            chai.expect(exitStub).to.be.calledWith(1);
            done();
          });
        });

        it('outputs error reason to console', function(done) {
          const consoleMock = sinon.mock(console);
          consoleMock
            .expects('error')
            .once()
            .withArgs('subdir/ already exists; we cannot build into an existing directory');

          sinon.stub(broccoli, 'server').value({ serve() {} });
          cli(['node', 'broccoli', 'serve', '--output-path', 'subdir']);

          process.nextTick(() => {
            consoleMock.verify();
            done();
          });
        });
      });
    });

    context('with param --no-watch', function() {
      it('should start a server with default values', function() {
        server
          .expects('serve')
          .once()
          .withArgs(
            sinon.match.instanceOf(broccoli.DummyWatcher),
            sinon.match.string,
            sinon.match.number
          );
        cli(['node', 'broccoli', 'serve', '--no-watch']);
        server.verify();
      });
    });
  });
});
