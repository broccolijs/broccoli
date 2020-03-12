import path from 'path';
import chai from 'chai';
import sinonChai from 'sinon-chai';
import Sinon from 'sinon';
import Watcher from '../lib/watcher';
import broccoli from '..';
const Builder = broccoli.Builder;
const multidepRequire = require('multidep')('test/multidep.json');
import SourceNodeWrapper from '../lib/wrappers/source-node';

const Plugin = multidepRequire('broccoli-plugin', '1.3.0');
const Merge = multidepRequire('broccoli-merge-trees', '4.1.0');

function defer() {
  let deferred = {};
  let promise = new Promise(function(resolve, reject) {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  deferred.promise = promise;
  return deferred;
}

function sleep(timeout = 10) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

const expect = chai.expect;
chai.use(sinonChai);
const sinon = Sinon.createSandbox();

describe('Watcher', function() {
  let watcher;

  afterEach(function() {
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
    cancel() {
      return Promise.resolve();
    },
  };

  const adapter = {
    on() {},
    watch() {},
    quit() {},
  };

  describe('start', function() {
    it('sets up event handlers, watchedPaths, and builds', async function() {
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

    it('throws error if called twice', function() {
      const watcher = new Watcher(builder, [], { watcherAdapter: adapter });
      watcher.start();
      expect(() => watcher.start()).to.throw(
        'Watcher.prototype.start() must not be called more than once'
      );
    });

    it('calls error if build rejects', async function() {
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
      let failHandler = sinon.spy();
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

  describe('change', function() {
    it('on change, rebuild is invoked', async function() {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      let debounceHandler = sinon.spy();
      let buildStartHandler = sinon.spy();
      let buildEndHandler = sinon.spy();
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

    it('on change, rebuild is invoked and cancel is invoked from the build', function() {
      const events = [];

      const waitForPlugin1 = defer();
      const waitForPlugin2 = defer();

      class Plugin1 extends Plugin {
        build() {
          events.push('plugin1');

          return waitForPlugin1.promise;
        }
      }

      class Plugin2 extends Plugin {
        build() {
          events.push('plugin2');

          return waitForPlugin2.promise;
        }
      }

      const plugin1 = new Plugin1([]);
      const plugin2 = new Plugin2([]);
      const builder = new Builder(Merge([plugin1, plugin2]));
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      watcher._ready = true;
      watcher.start();

      return sleep()
        .then(() => {
          const changedBuild = watcher._change('change', 'foo.js', 'root');

          waitForPlugin1.resolve();
          waitForPlugin2.resolve();

          return changedBuild;
        })
        .then(() => {
          expect(events).to.deep.equal(['plugin1']);

          return watcher.currentBuild;
        })
        .then(() => {
          expect(events).to.deep.equal(['plugin1', 'plugin1', 'plugin2']);
        });
    }).timeout(600000);

    it('does nothing if not ready', function() {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });

    it('does nothing if rebuilding', function() {
      const builderBuild = sinon.spy(builder, 'build');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._rebuildScheduled = true;
      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });

    it('filePath is undefined on initial build', async function() {
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const result = await watcher._build();
      expect(result.filePath).to.be.undefined;
    });

    it('filePath is set on rebuild', async function() {
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      const result = await watcher._build(path.join('root', 'file.js'));
      expect(result.filePath).to.equal(path.join('root', 'file.js'));
    });

    it('annotation is properly sent on initial build', async function() {
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

    it('annotation is properly sent on rebuild', async function() {
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

  describe('error', function() {
    it('emits an error and quits', function() {
      const error = new Error('fail');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let errorHandler = sinon.spy();
      let quitStartHandler = sinon.spy();
      let quitEndHandler = sinon.spy();
      watcher.on('error', errorHandler);
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      return watcher._error(error).catch(() => {
        expect(errorHandler).to.have.been.calledWith(error);
        expect(quitStartHandler).to.have.been.called;
        expect(quitEndHandler).to.have.been.called;
      });
    });

    it('does noting if already quitting', function() {
      const error = new Error('fail');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let errorHandler = sinon.spy();
      watcher.on('error', errorHandler);

      watcher._quittingPromise = true;

      watcher._error(error);
      expect(errorHandler).to.have.not.been.calledWith(error);
    });
  });

  describe('quit', function() {
    it('quits the watcher', async function() {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });

      let quitStartHandler = sinon.spy();
      let quitEndHandler = sinon.spy();
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

    it('does nothing if already quitting', function() {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, [watchedNodeBasic], { watcherAdapter: adapter });
      watcher._quittingPromise = true;

      let quitStartHandler = sinon.spy();
      let quitEndHandler = sinon.spy();
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      watcher.quit();
      expect(adapterQuit).to.not.have.been.called;
      expect(quitStartHandler).to.not.have.been.called;
      expect(quitEndHandler).to.not.have.been.called;
    });
  });
});
