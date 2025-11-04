import chai from 'chai';
import Sinon from 'sinon';
import got from 'got';
import fs from 'fs';
import Watcher from '../lib/watcher';
import multidep from './utils/multidep/index';

const expect = chai.expect;
const multidepRequire = multidep('test/multidep.json');
const sinon = Sinon.createSandbox();
import Server from '../lib/server';
import Builder from '../lib/builder';
import MockUI from 'console-ui/mock';

import makePlugins from './plugins';
const Plugin = multidepRequire('broccoli-plugin', '1.3.0');
const plugins = makePlugins(Plugin);

const broccoliSource = multidepRequire('broccoli-source', '1.1.0');
import SinonChai from 'sinon-chai';

chai.use(SinonChai);

describe('server', function() {
  let server;
  let PORT;

  before(async function() {
    PORT = await require('portfinder').getPortPromise({ port: 65529 });
  });

  afterEach(async function() {
    try {
      await (server && server.stop());
    } finally {
      sinon.restore();
    }
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

  it('errors if port already in use', async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const serverOne = new Server.Server(
      new Watcher(builder, []),
      '127.0.0.1',
      PORT,
      require('connect'),
      mockUI
    );

    const serverTwo = new Server.Server(
      new Watcher(builder, []),
      '127.0.0.1',
      PORT,
      require('connect'),
      mockUI
    );

    serverOne.start();

    try {
      await serverTwo.start();
      expect.fail('expected rejection');
    } catch (e) {
      expect(e.message).to.include('It appears a server is already running on');
    } finally {
      await Promise.all([serverOne.stop(), serverTwo.stop()]);
    }
  }).timeout(10000);

  it('starts with ssl if ssl option is passed', async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/ssl'));
    const watcher = new Watcher(builder, []);

    server = new Server.Server(
      watcher,
      '127.0.0.1',
      PORT,
      undefined,
      mockUI,
      true,
      'test/fixtures/ssl/ssl/server.key',
      'test/fixtures/ssl/ssl/server.crt'
    );
    server.start();

    await new Promise((resolve, reject) => {
      server.instance.on('listening', resolve);
      server.instance.on('close', reject);
      server.instance.on('error', reject);
    });

    const { statusCode } = await got(`https://127.0.0.1:${PORT}/`, { rejectUnauthorized: false });
    expect(statusCode).to.eql(200);
  }).timeout(5000);

  it('support SPA routing to index.html from child paths', async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/spa'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);
    server.start();
    await new Promise(resolve => {
      server.instance.on('listening', resolve);
    });
    const { statusCode, body } = await got(`http://127.0.0.1:${PORT}/foo/bar/baz`, {
      headers: {
        Accept: 'text/html',
      },
    }); // basic serving
    expect(statusCode).to.eql(200);
    expect(body).to.contain('Hello from SPA');
  }).timeout(5000);

  it("skip SPA routing to index.html from child path if it's ends with extension", async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/spa'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);
    server.start();
    await new Promise(resolve => {
      server.instance.on('listening', resolve);
    });
    try {
      await got(`http://127.0.0.1:${PORT}/foo/bar/baz.png`);
      expect.fail('expected rejection');
    } catch (e) {
      expect(e.statusCode).to.equal(404);
      expect(e.body).to.include(`Cannot GET /foo/bar/baz.png`);
    }
  }).timeout(5000);

  it('skip SPA routing to index.html from child path contains dot', async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/spa'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);
    server.start();
    await new Promise(resolve => {
      server.instance.on('listening', resolve);
    });
    try {
      await got(`http://127.0.0.1:${PORT}/foo/b.ar/baz`);
      expect.fail('expected rejection');
    } catch (e) {
      expect(e.statusCode).to.equal(404);
      expect(e.body).to.include(`Cannot GET /foo/b.ar/baz`);
    }
  }).timeout(5000);

  it('buildSuccess is handled', async function() {
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/basic'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);

    const start = server.start();

    let buildSuccessWasCalled = 0;

    server.addListener('buildSuccess', () => {
      buildSuccessWasCalled++;
      server.stop();
    });

    await start;
    expect(buildSuccessWasCalled).to.eql(1);
  });

  it('converts ANSI codes to HTML from the error stack', async function() {
    const error = new Error('whoops');
    error.stack = `\u001b[35m102\u001b[39m\u001b[33m\u001b[0m`;

    const mockUI = new MockUI();
    const builder = new Builder(new plugins.Merge([new plugins.Failing(error)]));
    const watcher = new Watcher(builder, []);

    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);
    server.start().catch(() => {});

    await new Promise((resolve, reject) => {
      server.instance.on('listening', resolve);
      server.instance.on('close', reject);
      server.instance.on('error', reject);
    });

    try {
      await got(`http://127.0.0.1:${PORT}/`);
      expect.fail('expected rejection');
    } catch (e) {
      expect(e.body).to.include(`<span style="color:#ff00ff;">102</span>`);
    }
  }).timeout(5000);

  it('supports being provided a custom connect middleware root', function() {
    const mockUI = new MockUI();
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
    server = new Server.Server(watcher, '127.0.0.1', PORT, altConnect, mockUI);
    server.start();
    expect(altConnectWasUsed).to.eql(true);
  });

  it('supports serving a built file', async function() {
    fs.utimesSync(
      'test/fixtures/public/foo.txt',
      new Date('2018-07-27T17:25:23.102Z'),
      new Date('2018-07-27T17:23:02.000Z')
    );
    const mockUI = new MockUI();
    const builder = new Builder(new broccoliSource.WatchedDir('test/fixtures/public'));
    const watcher = new Watcher(builder, []);
    server = new Server.Server(watcher, '127.0.0.1', PORT, undefined, mockUI);
    server.start();

    await new Promise((resolve, reject) => {
      server.instance.on('listening', resolve);
      server.instance.on('close', reject);
      server.instance.on('error', reject);
    });

    {
      const { statusCode, body, headers } = await got(`http://127.0.0.1:${PORT}/foo.txt`); // basic serving
      expect(statusCode).to.eql(200);
      expect(body).to.eql('Hello');
      expect(headers['last-modified']).to.eql('Fri, 27 Jul 2018 17:23:02 GMT');
      expect(headers['cache-control']).to.eql('private, max-age=0, must-revalidate');
      expect(headers['content-length']).to.eql('5');
      expect(headers['content-type']).to.eql('text/plain; charset=utf-8');
    }

    {
      const { statusCode, body, headers } = await got(`http://127.0.0.1:${PORT}/`); // generated index
      expect(statusCode).to.eql(200);
      expect(headers['content-type']).to.eql('text/html; charset=utf-8');
      expect(body).to.match(/foo\.txt/);
    }

    {
      const { statusCode, body, headers } = await got(`http://127.0.0.1:${PORT}/subpath`); // index redirect and existing index.html
      expect(statusCode).to.eql(200);
      expect(headers['content-type']).to.eql('text/html; charset=utf-8');
      expect(body).to.eql('<html><body>Index</body></html>');
    }

    {
      try {
        await got(`http://127.0.0.1:${PORT}/../public/foo.txt`); // don't leak root
        expect.fail('expected rejection');
      } catch (e) {
        expect(e.message).to.match(/Forbidden/);
      }
    }
  }).timeout(10000);
});
