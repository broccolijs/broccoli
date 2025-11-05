import path from 'path';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import Sinon from 'sinon';
import Watcher from '../lib/watcher';
import SourceNodeWrapper from '../lib/wrappers/source-node';

const expect = chai.expect;
chai.use(sinonChai);
const sinon = Sinon.createSandbox();

describe('Watcher', function () {
  let watcher;

  afterEach(function () {
    if (watcher) {
      watcher.quit();
      watcher = null;
    }

    sinon.restore();
  });

  const FIXTURE_BASIC = __dirname + '/fixtures/basic';
  const watchedNodeBasic = new SourceNodeWrapper();
  watchedNodeBasic.nodeInfo = {
    nodeType: 'source',
    sourceDirectory: FIXTURE_BASIC,
    watched: true,
  };

  const builder = {
    async build(_, buildAnnotation) {
      return buildAnnotation;
    },
  };

  const adapter = {
    on() {},
    watch() {},
    quit() {},
  };

  describe('start', function () {
    it('sets up event handlers, watchedPaths, and builds', async function () {
      const builderBuild = sinon.spy(builder, 'build');

      const watchedNodes = [watchedNodeBasic];
      watcher = new Watcher(builder, watchedNodes);
      const trigger = sinon.stub(watcher, 'emit');
      const adapterOn = sinon.spy(watcher.watcherAdapter, 'on');
      const adapterWatch = sinon.spy(watcher.watcherAdapter, 'watch');

      watcher.start();

      expect(watcher.watcherAdapter.watchedNodes).to.equal(watchedNodes);
      expect(adapterOn).to.have.been.calledWith('change');
      expect(adapterOn).to.have.been.calledWith('error');

      const result = await watcher.currentBuild;
      expect(result).to.eql({
        type: 'initial',
        reason: 'watcher',
        primaryFile: undefined,
        changedFiles: [],
        filePath: undefined,
      });
      expect(adapterWatch).to.have.been.called;
      expect(trigger).to.have.been.calledWith('buildStart');
      expect(trigger).to.have.been.calledWith('buildSuccess');
      expect(builderBuild).to.have.been.called;
    });

    it('throws error if called twice', function () {
      const watcher = new Watcher(builder, [], { watcherAdapter: adapter });
      watcher.start();
      expect(() => watcher.start()).to.throw(
        'Watcher.prototype.start() must not be called more than once'
      );
    });

    it('calls error if build rejects', async function () {
      const watcher = new Watcher(
        {
          nodeWrappers: [],
          build() {
            return Promise.reject('fail');
          },
        },
        [],
        { watcherAdapter: adapter }
      );
      const failHandler = sinon.spy();
      watcher.on('buildFailure', failHandler);

      watcher.start();

      try {
        await watcher.currentBuild;
        expect.fail();
      } catch (e) {
        expect(e).to.equal('fail');
        expect(failHandler).to.be.have.been.calledWith('fail');
      }
    });
  });

  describe('change', function () {
    it('on change, rebuild is invoked', async function () {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const changeHandler = sinon.spy();
      const debounceHandler = sinon.spy();
      const buildStartHandler = sinon.spy();
      const buildEndHandler = sinon.spy();
      watcher.on('change', changeHandler);
      watcher.on('debounce', debounceHandler);
      watcher.on('buildStart', buildStartHandler);
      watcher.on('buildSuccess', buildEndHandler);
      // TODO: stop using mocks, spies and private API's
      watcher._ready = true;
      await watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.have.been.calledWith('change', 'file.js', 'root');

      const result = await watcher.currentBuild;

      expect(result).to.eql({
        type: 'rebuild',
        reason: 'watcher',
        primaryFile: path.join('root', 'file.js'),
        changedFiles: [path.join('root', 'file.js')],
        filePath: path.join('root', 'file.js'),
      });

      expect(debounceHandler).to.have.been.called;
      expect(buildStartHandler).to.have.been.called;
      expect(buildEndHandler).to.have.been.called;
      expect(builderBuild).to.have.been.called;
    });

    it('does nothing if not ready', function () {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });

    it('does nothing if rebuilding', function () {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._rebuildScheduled = true;
      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });

    it('filePath is undefined on initial build', async function () {
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const result = await watcher._build();
      expect(result.filePath).to.be.undefined;
    });

    it('filePath is set on rebuild', async function () {
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const result = await watcher._build(path.join('root', 'file.js'));
      expect(result.filePath).to.equal(path.join('root', 'file.js'));
    });

    it('annotation is properly sent on initial build', async function () {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      await watcher._build();

      expect(builderBuild.args[0][1]).to.deep.equal({
        type: 'initial',
        reason: 'watcher',
        primaryFile: undefined,
        filePath: undefined,
        changedFiles: [],
      });
    });

    it('annotation is properly sent on rebuild', async function () {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      watcher._changedFiles = [path.join('root', 'file.js')];

      await watcher._build(path.join('root', 'file.js'));

      expect(builderBuild.args[0][1]).to.deep.equal({
        type: 'rebuild',
        reason: 'watcher',
        primaryFile: path.join('root', 'file.js'),
        filePath: path.join('root', 'file.js'),
        changedFiles: [path.join('root', 'file.js')],
      });
    });
  });

  describe('error', function () {
    it('emits an error and quits', function () {
      const error = new Error('fail');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const errorHandler = sinon.spy();
      const quitStartHandler = sinon.spy();
      const quitEndHandler = sinon.spy();
      watcher.on('error', errorHandler);
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      return watcher._error(error).catch(() => {
        expect(errorHandler).to.have.been.calledWith(error);
        expect(quitStartHandler).to.have.been.called;
        expect(quitEndHandler).to.have.been.called;
      });
    });

    it('does noting if already quitting', function () {
      const error = new Error('fail');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const errorHandler = sinon.spy();
      watcher.on('error', errorHandler);

      watcher._quittingPromise = true;

      watcher._error(error);
      expect(errorHandler).to.have.not.been.calledWith(error);
    });
  });

  describe('quit', function () {
    it('quits the watcher', async function () {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const quitStartHandler = sinon.spy();
      const quitEndHandler = sinon.spy();
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      watcher.start();

      const result = await watcher.currentBuild;

      expect(result).to.eql({
        type: 'initial',
        reason: 'watcher',
        primaryFile: undefined,
        changedFiles: [],
        filePath: undefined,
      });

      await watcher.quit();
      expect(adapterQuit).to.have.been.called;
      expect(quitStartHandler).to.have.been.called;
      expect(quitEndHandler).to.have.been.called;
    });

    it('does nothing if already quitting', function () {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });
      watcher._quittingPromise = true;

      const quitStartHandler = sinon.spy();
      const quitEndHandler = sinon.spy();
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      watcher.quit();
      expect(adapterQuit).to.not.have.been.called;
      expect(quitStartHandler).to.not.have.been.called;
      expect(quitEndHandler).to.not.have.been.called;
    });
  });
});
