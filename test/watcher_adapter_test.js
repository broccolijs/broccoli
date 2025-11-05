import fs from 'fs';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import Sinon from 'sinon';
import TransformNodeWrapper from '../lib/wrappers/transform-node';
import SourceNodeWrapper from '../lib/wrappers/source-node';
import WatcherAdapter from '../lib/watcher_adapter';
import bindFileEvent from '../lib/utils/bind-file-event';
import { join } from 'path';

const expect = chai.expect;
chai.use(sinonChai);
const sinon = Sinon.createSandbox();

function spin(cb, limit) {
  return new Promise((resolve, reject) => {
    let spinner;
    const cancel = setTimeout(() => {
      clearTimeout(spinner);
      try {
        cb();
        resolve();
      } catch (e) {
        reject(e);
      }
    }, limit);

    (function spin() {
      try {
        cb();
        clearTimeout(cancel);
        resolve();
      } catch (e) {
        if (e.name === 'AssertionError') {
          spinner = setTimeout(spin, 0);
        }
      }
    })();
  });
}

describe('WatcherAdapter', function () {
  afterEach(function () {
    sinon.restore();
  });

  const FIXTURE_BASIC = __dirname + '/fixtures/basic';
  const FIXTURE_PROJECT = __dirname + '/fixtures/project';
  const watchedNodeBasic = new SourceNodeWrapper();
  watchedNodeBasic.nodeInfo = {
    nodeType: 'source',
    sourceDirectory: FIXTURE_BASIC,
    watched: true,
  };

  const unwatchedNodeBasic = new SourceNodeWrapper();
  unwatchedNodeBasic.nodeInfo = {
    nodeType: 'source',
    sourceDirectory: FIXTURE_BASIC,
    watched: false,
  };

  const watchedNodeProject = new SourceNodeWrapper();
  watchedNodeProject.nodeInfo = {
    nodeType: 'source',
    sourceDirectory: FIXTURE_PROJECT,
    watched: true,
  };

  describe('bindFileEvent', function () {
    const adapter = {
      emit() {},
    };

    const watcher = {
      on(name, cb) {
        cb();
      },
    };

    const watchedNode = {
      revise() {},
    };

    it('works', function () {
      const emitHandler = sinon.spy();
      adapter.emit = emitHandler;
      const on = sinon.spy(watcher, 'on');
      const revise = sinon.spy(watchedNode, 'revise');

      expect(on).to.have.not.been.called;
      expect(emitHandler).to.have.not.been.called;
      expect(revise).to.have.not.been.called;

      bindFileEvent(adapter, watcher, watchedNode, 'change');

      expect(on).to.have.been.calledOnce;
      expect(emitHandler).to.have.been.calledOnce;
      expect(revise).to.have.been.calledOnce;
      expect(on).to.have.been.calledWith('change');
      expect(emitHandler).to.have.been.calledWith('change', 'change');

      bindFileEvent(adapter, watcher, watchedNode, 'add');

      expect(on).to.have.been.calledTwice;
      expect(emitHandler).to.have.been.calledTwice;
      expect(revise).to.have.been.calledTwice;
      expect(on).to.have.been.calledWith('add');
      expect(emitHandler).to.have.been.calledWith('change', 'add');

      bindFileEvent(adapter, watcher, watchedNode, 'remove');

      expect(on).to.have.been.calledThrice;
      expect(emitHandler).to.have.been.calledThrice;
      expect(revise).to.have.been.calledThrice;
      expect(on).to.have.been.calledWith('remove');
      expect(emitHandler).to.have.been.calledWith('change', 'remove');
    });
  });

  describe('constructor', function () {
    it('does not support call constructor', function () {
      expect(() => WatcherAdapter()).to.throw(/\bwithout 'new'/);
    });

    it('throws if you try to watch a non array', function () {
      [NaN, {}, { length: 0 }, 'string', function () {}, Symbol('OMG')].forEach((arg) => {
        expect(() => new WatcherAdapter(arg)).to.throw(
          TypeError,
          `WatcherAdapter's first argument must be an array of SourceNodeWrapper nodes`
        );
      });
    });

    it('throws if you try to watch a non node', function () {
      expect(() => new WatcherAdapter([{}])).to.throw(Error, `[object Object] is not a SourceNode`);
    });

    it('throws if you try to watch a non-source node', function () {
      expect(() => new WatcherAdapter([new TransformNodeWrapper()])).to.throw(
        Error,
        `[NodeWrapper:undefined undefined at undefined] is not a SourceNode`
      );
    });

    it('throws if you try to watch a non-watchable node', function () {
      expect(() => new WatcherAdapter([unwatchedNodeBasic])).to.throw(
        Error,
        /[/\\]broccoli[/\\]test[/\\]fixtures[/\\]basic' is not watched/
      );
    });
  });

  describe('watch', function () {
    this.timeout(20000);

    const isWin = process.platform === 'win32';
    const FIXTURE_BASIC = __dirname + (isWin ? '\\fixtures\\basic' : '/fixtures/basic');
    const FIXTURE_PROJECT = __dirname + (isWin ? '\\fixtures\\project' : '/fixtures/project');
    let adapter;

    afterEach(async function () {
      await adapter.quit();
    });

    it('supports symmetric start/shutdown', function () {
      adapter = new WatcherAdapter([]);
    });

    it('actually works !!', function () {
      adapter = new WatcherAdapter([watchedNodeBasic]);
      const changeHandler = sinon.spy();
      adapter.on('change', changeHandler);

      expect(changeHandler).to.have.callCount(0);

      expect(adapter.watchers.length).to.eql(0);

      const watching = adapter.watch();

      expect(adapter.watchers.length).to.eql(1);

      return watching.then(function () {
        expect(arguments.length).to.eql(1);

        expect(changeHandler).to.have.callCount(0);
        fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
        fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

        return spin(() => expect(changeHandler).to.have.callCount(1), 10000).then(() => {
          expect(changeHandler).to.have.been.calledWith('change', 'foo.txt', FIXTURE_BASIC);

          // reset the spy
          changeHandler.resetHistory();

          // this time also watch the FIXTURE_PROJECT
          const watching = adapter.watch([watchedNodeProject]);
          expect(adapter.watchers.length).to.eql(2);

          return watching.then((val) => {
            expect(val).to.eql(undefined);

            fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
            fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

            return spin(() => expect(changeHandler).to.have.callCount(2), 10000)
              .then(() => {
                expect(changeHandler).to.have.been.calledWith('change');
              })
              .then(() => {
                changeHandler.resetHistory();

                fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
                fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

                expect(adapter.watchers.length).to.eql(2);
                const quitting = adapter.quit();
                expect(adapter.watchers.length).to.eql(0);
                return quitting.then((val) => {
                  expect(val).to.eql(undefined);
                  return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      try {
                        expect(changeHandler).to.have.callCount(0);
                        resolve();
                      } catch (e) {
                        reject(e);
                      }
                    }, 500);
                  });
                });
              });
          });
        });
      });
    });
  });
  describe('optionsFor', function () {
    let adapter;
    beforeEach(function () {
      adapter = new WatcherAdapter([], {}, [join(__dirname, 'my-ignored-subdir')]);
    });
    afterEach(async function () {
      await adapter.quit();
    });
    it('generates a relative ignored path inside watchedDir', function () {
      const options = adapter.optionsFor(__dirname);
      expect(options.ignored).to.deep.eq(['my-ignored-subdir/**']);
    });
    it('generates no relative ignored paths when they are outside watchedDir', function () {
      const options = adapter.optionsFor('/somewhere/else');
      expect(options.ignored).to.eq(undefined);
    });
    it('is not fooled by name prefix matches', function () {
      const options = adapter.optionsFor(join(__dirname, 'my-ignored-subdir-just-kidding'));
      expect(options.ignored).to.eq(undefined);
    });
  });
});
