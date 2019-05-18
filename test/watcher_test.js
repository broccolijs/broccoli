'use strict';

const Watcher = require('../lib/watcher');

const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const sinon = require('sinon').createSandbox();

describe('Watcher', function() {
  afterEach(function() {
    sinon.restore();
  });

  const builder = {
    nodeWrappers: [
      {
        nodeInfo: {
          sourceDirectory: 'some/path',
          nodeType: 'source',
          watched: true,
        },
      },
    ],
    build() {
      return Promise.resolve();
    },
  };

  const adapter = {
    on() {},
    watch() {},
    quit() {},
  };

  describe('start', function() {
    it('sets up event handlers, watchedPaths, and builds', function() {
      const adapterOn = sinon.spy(adapter, 'on');
      const adapterWatch = sinon.spy(adapter, 'watch');
      const builderBuild = sinon.spy(builder, 'build');

      const watcher = new Watcher(builder, { watcherAdapter: adapter });
      const trigger = sinon.stub(watcher, 'emit');

      watcher.start();

      expect(adapterOn).to.have.been.calledWith('change');
      expect(adapterOn).to.have.been.calledWith('error');

      return watcher.currentBuild.then(() => {
        expect(adapterWatch).to.have.been.calledWith(builder.nodeWrappers);
        expect(trigger).to.have.been.calledWith('buildStart');
        expect(trigger).to.have.been.calledWith('buildSuccess');
        expect(builderBuild).to.have.been.called;
      });
    });

    it('throws error if called twice', function() {
      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      watcher._lifetimeDeferred = true;
      expect(watcher.start.bind(watcher)).to.throw(
        'Watcher.prototype.start() must not be called more than once'
      );
    });

    it('calls error if build rejects', function() {
      const watcher = new Watcher(
        {
          nodeWrappers: [],
          build() {
            return Promise.reject('fail');
          },
        },
        { watcherAdapter: adapter }
      );
      let failHandler = sinon.spy();
      watcher.on('buildFailure', failHandler);

      watcher.start();

      return watcher.currentBuild.catch(error => {
        expect(error).to.equal('fail');
        expect(failHandler).to.be.have.been.calledWith('fail');
      });
    });
  });

  describe('change', function() {
    it('on change, rebuild is invoked', function() {
      const builderBuild = sinon.spy(builder, 'build');

      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      let debounceHandler = sinon.spy();
      let buildStartHandler = sinon.spy();
      let buildEndHandler = sinon.spy();
      watcher.on('change', changeHandler);
      watcher.on('debounce', debounceHandler);
      watcher.on('buildStart', buildStartHandler);
      watcher.on('buildSuccess', buildEndHandler);

      watcher._ready = true;
      return watcher._change('change', 'file.js', 'root').then(() => {
        expect(changeHandler).to.have.been.calledWith('change', 'file.js', 'root');

        return watcher.currentBuild.then(() => {
          expect(debounceHandler).to.have.been.called;
          expect(buildStartHandler).to.have.been.called;
          expect(buildEndHandler).to.have.been.called;
          expect(builderBuild).to.have.been.called;
        });
      });
    });

    it('does nothing if not ready', function() {
      const builderBuild = sinon.spy(builder, 'build');

      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });

    it('does nothing if rebuilding', function() {
      const builderBuild = sinon.spy(builder, 'build');

      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      let changeHandler = sinon.spy();
      watcher.on('change', changeHandler);

      watcher._rebuildScheduled = true;
      watcher._change('change', 'file.js', 'root');
      expect(changeHandler).to.not.have.been.calledWith('change', 'change', 'file.js', 'root');
      expect(builderBuild).to.not.have.been.called;
    });
  });

  describe('error', function() {
    it('emits an error and quits', function() {
      const error = new Error('fail');
      const watcher = new Watcher(builder, { watcherAdapter: adapter });

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
      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      let errorHandler = sinon.spy();
      watcher.on('error', errorHandler);

      watcher._quittingPromise = true;

      watcher._error(error);
      expect(errorHandler).to.have.not.been.calledWith(error);
    });
  });

  describe('quit', function() {
    it('quits the watcher', function() {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, { watcherAdapter: adapter });

      let quitStartHandler = sinon.spy();
      let quitEndHandler = sinon.spy();
      watcher.on('quitStart', quitStartHandler);
      watcher.on('quitEnd', quitEndHandler);

      watcher.start();

      return watcher.currentBuild.then(() => {
        return watcher.quit().then(() => {
          expect(adapterQuit).to.have.been.called;
          expect(quitStartHandler).to.have.been.called;
          expect(quitEndHandler).to.have.been.called;
        });
      });
    });

    it('does nothing if already quitting', function() {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, { watcherAdapter: adapter });
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
