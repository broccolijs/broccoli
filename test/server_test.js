'use strict';

var Server = require('../lib/server');
var Watcher = require('../lib/watcher');
var Builder = require('../lib/builder');
var expect = require('chai').expect;
var multidepRequire = require('multidep')('test/multidep.json');
var broccoliSource = multidepRequire('broccoli-source', '1.1.0');

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
    var builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    var watcher = new Watcher(builder);
    var server = Server.serve(watcher, '0.0.0.0', 4200);
    var onBuildSuccessful = server.onBuildSuccessful;
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
