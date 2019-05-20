'use strict';

const chai = require('chai');
const expect = chai.expect;
const multidepRequire = require('multidep')('test/multidep.json');
const sinon = require('sinon').createSandbox();
const got = require('got');
const fs = require('fs');
const promiseFinally = require('promise.prototype.finally');

const Server = require('../lib/server');
const Watcher = require('../lib/watcher');
const Builder = require('../lib/builder');

const broccoliSource = multidepRequire('broccoli-source', '1.1.0');

chai.use(require('sinon-chai'));

describe('server', function() {
  let server;
  let PORT;

  before(function() {
    return require('portfinder')
      .getPortPromise({ port: 65529 })
      .then(port => (PORT = port));
  });

  afterEach(function() {
    const stopping = server ? server.stop() : Promise.resolve();

    return promiseFinally(stopping, () => sinon.restore());
  });

  it('throws if first argument is not an instance of Watcher', function() {
    expect(() => Server.serve({}, 123, 1234)).to.throw(/Watcher/);
  });

  it('throws if host is not a string', function() {
    expect(() => Server.serve(new Watcher(null, []), 123, 1234)).to.throw(/host/);
  });

  it('throws if port is not a number', function() {
    expect(() => Server.serve(new Watcher(null, []), '127.0.0.1', '1234')).to.throw(/port/);
  });

  it('throws if port is NaN', function() {
    expect(() => Server.serve(new Watcher(null, []), '127.0.0.1', parseInt('port'))).to.throw(
      /port/
    );
  });

  it('errors if port already in use', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const serverOne = new Server.Server(new Watcher(builder, []), '127.0.0.1', PORT, undefined);
    const serverTwo = new Server.Server(new Watcher(builder, []), '127.0.0.1', PORT, undefined);

    serverOne.start();

    const wait = serverTwo.start().then(
      () => {
        throw new Error('should not fulfill');
      },
      err => {
        expect(err.message).to.include('It appears a server is already running on');
      }
    );

    return promiseFinally(wait, () => {
      return Promise.all([serverOne.stop(), serverTwo.stop()]);
    });
  }).timeout(10000);

  it('buildSuccess is handled', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT);

    const start = server.start();

    let buildSuccessWasCalled = 0;

    server.addListener('buildSuccess', () => {
      buildSuccessWasCalled++;
      server.stop();
    });

    return start.then(() => {
      expect(buildSuccessWasCalled).to.eql(1);
    });
  });

  it('supports being provided a custom connect middleware root', function() {
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder, []);
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
    server = new Server.Server(watcher, '127.0.0.1', PORT, altConnect);
    server.start();
    expect(altConnectWasUsed).to.eql(true);
  });

  it('supports serving a built file', function() {
    fs.utimesSync(
      'test/fixtures/public/foo.txt',
      new Date('2018-07-27T17:25:23.102Z'),
      new Date('2018-07-27T17:23:02.000Z')
    );
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/public'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT);
    server.start();

    return new Promise((resolve, reject) => {
      server.http.on('listening', resolve);
      server.http.on('close', reject);
      server.http.on('error', reject);
    }).then(() => {
      return got(`http://127.0.0.1:${PORT}/foo.txt`) // basic serving
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
        );
    });
  }).timeout(10000);
});
