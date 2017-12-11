'use strict';

const RSVP = require('rsvp');
const expect = require('chai').expect;
const multidepRequire = require('multidep')('test/multidep.json');
const sinon = require('sinon').createSandbox();

const Server = require('../lib/server');
const Watcher = require('../lib/watcher');
const Builder = require('../lib/builder');

const broccoliSource = multidepRequire('broccoli-source', '1.1.0');

describe('server', function() {
  let server;
  let PORT;

  beforeEach(function() {
    sinon.stub(process, 'exit');
  });

  before(function() {
    return require('portfinder')
      .getPortPromise({ port: 65529 })
      .then(port => (PORT = port));
  });

  afterEach(function() {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');

    let closingPromise = Promise.resolve();

    if (server) {
      server.cleanupAndExit();
      if (server.closingPromise) {
        closingPromise = server.closingPromise;
      }
    }

    return closingPromise.then(() => sinon.restore());
  });

  it('throws if first argument is not an instance of Watcher', function() {
    expect(() => Server.serve({}, 123, 1234)).to.throw(/Watcher/);
  });

  it('throws if host is not a string', function() {
    expect(() => Server.serve(new Watcher(), 123, 1234)).to.throw(/host/);
  });

  it('throws if port is not a number', function() {
    expect(() => Server.serve(new Watcher(), '0.0.0.0', '1234')).to.throw(/port/);
  });

  it('throws if port is NaN', function() {
    expect(() => Server.serve(new Watcher(), '0.0.0.0', parseInt('port'))).to.throw(/port/);
  });

  it('buildSuccess is handled', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder);
    server = Server.serve(watcher, '0.0.0.0', PORT);
    const onBuildSuccessful = server.onBuildSuccessful;

    return new RSVP.Promise((resolve, reject) => {
      server.onBuildSuccessful = function() {
        try {
          onBuildSuccessful();
          resolve();
        } catch (e) {
          reject(e);
        }
        watcher.quit();
      };
    }).then(() => server.closingPromise);
  });

  it('supports being provided a custom connect middleware root', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder);
    let altConnectWasUsed = false;

    function altConnect() {
      return {
        use() {
          altConnectWasUsed = true;
          return function listener() {};
        },
      };
    }

    expect(altConnectWasUsed).to.eql(false);
    server = Server.serve(watcher, '0.0.0.0', PORT, altConnect);
    expect(altConnectWasUsed).to.eql(true);
    const onBuildSuccessful = server.onBuildSuccessful;
    return new RSVP.Promise((resolve, reject) => {
      server.onBuildSuccessful = function() {
        try {
          onBuildSuccessful();
          resolve();
        } catch (e) {
          reject(e);
        }
        watcher.quit();
      };
    }).then(() => server.closingPromise);
  });
});
