'use strict';

const Server = require('../lib/server');
const Watcher = require('../lib/watcher');
const Builder = require('../lib/builder');
const expect = require('chai').expect;
const multidepRequire = require('multidep')('test/multidep.json');
const broccoliSource = multidepRequire('broccoli-source', '1.1.0');

describe('server', function() {
  it('throws if first argument is not an instance of Watcher', function() {
    expect(function() {
      Server.serve({}, 123, 1234);
    }).to.throw(/Watcher/);
  });
  it('throws if host is not a string', function() {
    expect(function() {
      Server.serve(new Watcher(), 123, 1234);
    }).to.throw(/host/);
  });
  it('throws if port is not a number', function() {
    expect(function() {
      Server.serve(new Watcher(), '0.0.0.0', '1234');
    }).to.throw(/port/);
  });
  it('throws if port is NaN', function() {
    expect(function() {
      Server.serve(new Watcher(), '0.0.0.0', parseInt('port'));
    }).to.throw(/port/);
  });
  it('buildSuccess is handled', function(done) {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder);
    const server = Server.serve(watcher, '0.0.0.0', 4200);
    const onBuildSuccessful = server.onBuildSuccessful;
    server.onBuildSuccessful = function() {
      try {
        onBuildSuccessful();
        done();
      } catch (e) {
        done(e);
      }
    };
  });
});
