'use strict';

const chai = require('chai');
const expect = chai.expect;
const multidepRequire = require('multidep')('test/multidep.json');
const sinon = require('sinon').createSandbox();
const got = require('got');
const fs = require('fs');

const Server = require('../lib/server');
const Watcher = require('../lib/watcher');
const Builder = require('../lib/builder');

const broccoliSource = multidepRequire('broccoli-source', '1.1.0');

chai.use(require('sinon-chai'));

describe('server', function() {
  let server, exitStub;
  let PORT;

  beforeEach(function() {
    exitStub = sinon.stub(process, 'exit');
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
    expect(() => Server.serve(new Watcher(), '127.0.0.1', '1234')).to.throw(/port/);
  });

  it('throws if port is NaN', function() {
    expect(() => Server.serve(new Watcher(), '127.0.0.1', parseInt('port'))).to.throw(/port/);
  });

  it('errors if port already in use', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));

    const invokeServer = (isPrimary) => {
      const watcher = new Watcher(builder);
      const svr = Server.serve(watcher, '127.0.0.1', PORT);
      if (isPrimary) {
        server = svr;
      }
      const onBuildSuccessful = svr.onBuildSuccessful;

      return new Promise((resolve, reject) => {
        svr.onBuildSuccessful = function() {
          try {
            onBuildSuccessful();
            resolve();
          } catch (e) {
            reject(e);
          }
          watcher.quit();
        }
      });
    };

    return invokeServer(true)
      .then(invokeServer)
      .then(() => server.closingPromise)
      .then(() => {
        chai.expect(exitStub).to.be.calledWith(1);
      });
  });

  it('buildSuccess is handled', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder);
    server = Server.serve(watcher, '127.0.0.1', PORT);
    const onBuildSuccessful = server.onBuildSuccessful;

    return new Promise((resolve, reject) => {
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
    server = Server.serve(watcher, '127.0.0.1', PORT, altConnect);
    expect(altConnectWasUsed).to.eql(true);
    const onBuildSuccessful = server.onBuildSuccessful;
    return new Promise((resolve, reject) => {
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

  it('supports serving a built file', function() {
    fs.utimesSync(
      'test/fixtures/public/foo.txt',
      new Date('2018-07-27T17:25:23.102Z'),
      new Date('2018-07-27T17:23:02.000Z')
    );
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/public'));
    const watcher = new Watcher(builder);
    server = Server.serve(watcher, '127.0.0.1', PORT);
    return new Promise((resolve, reject) => {
      server.http.on('listening', resolve);
      server.http.on('close', reject);
      server.http.on('error', reject);
    }).then(() =>
      got(`http://127.0.0.1:${PORT}/foo.txt`) // basic serving
        .then(res => {
          expect(res.statusCode).to.eql(200);
          expect(res.body).to.eql('Hello');
          expect(res.headers['last-modified']).to.eql('Fri, 27 Jul 2018 17:23:02 GMT');
          expect(res.headers['cache-control']).to.eql('private, max-age=0, must-revalidate');
          expect(res.headers['content-length']).to.eql('5');
          expect(res.headers['content-type']).to.eql('text/plain; charset=utf-8');
        })
        .then(() => got(`http://127.0.0.1:${PORT}/`)) // generated index
        .then(res => {
          expect(res.statusCode).to.eql(200);
          expect(res.headers['content-type']).to.eql('text/html; charset=utf-8');
          expect(res.body).to.match(/foo\.txt/);
        })
        .then(() => got(`http://127.0.0.1:${PORT}/subpath`)) // index redirect and existing index.html
        .then(res => {
          expect(res.statusCode).to.eql(200);
          expect(res.headers['content-type']).to.eql('text/html; charset=utf-8');
          expect(res.body).to.eql('<html><body>Index</body></html>');
        })
        .then(() => got(`http://127.0.0.1:${PORT}/../public/foo.txt`)) // dont leak root
        .then(
          () => {
            new Error('should not be reached');
          },
          err => {
            expect(err.message).to.match(/Forbidden/);
          }
        )
    );
  }).timeout(10000);
});
