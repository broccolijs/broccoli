'use strict';

const Watcher = require('../lib/watcher');
const WatcherAdapter = require('../lib/watcher_adapter');

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
    watchedPaths: [
      'some/path'
    ],
    build() {
      return Promise.resolve();
    }
  };

  const adapter = {
    on(event, cb) {

    },
    watch(watchedPaths) {

    },
    quit() {

    }
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
        expect(adapterWatch).to.have.been.calledWith(builder.watchedPaths);
        expect(trigger).to.have.been.calledWith('buildStart');
        expect(trigger).to.have.been.calledWith('buildSuccess');
        expect(builderBuild).to.have.been.called;
      })
    })
  });

  describe('change', function() {
    it('on change, rebuild is invoked', function() {
      const builderBuild = sinon.spy(builder, 'build');

      const watcher = new Watcher(builder, { watcherAdapter: adapter });
      const trigger = sinon.stub(watcher, 'emit');

      watcher._ready = true;
      return watcher._change('change', 'file.js', 'root').then(() => {
        expect(trigger).to.have.been.calledWith('change', 'change', 'file.js', 'root');

        return watcher.currentBuild.then(() => {
          expect(trigger).to.have.been.calledWith('debounce');
          expect(trigger).to.have.been.calledWith('buildStart');
          expect(trigger).to.have.been.calledWith('buildSuccess');
          expect(builderBuild).to.have.been.called;
        });
      });
    })
  });

  describe('error', function() {
    it('emits an error and quits', function() {
      const error = new Error('fail');
      const watcher = new Watcher(builder, { watcherAdapter: adapter });
      const trigger = sinon.stub(watcher, 'emit');

      return watcher._error(error).catch(() => {
        expect(trigger).to.have.been.calledWith('error', error);
        expect(trigger).to.have.been.calledWith('quitStart');
        expect(trigger).to.have.been.calledWith('quitEnd');
      });
    })
  });

  describe('quit', function() {
    it('quits the watcher', function() {
      const adapterQuit = sinon.spy(adapter, 'quit');
      const watcher = new Watcher(builder, { watcherAdapter: adapter });
      const trigger = sinon.stub(watcher, 'emit');

      watcher.start();

      return watcher.currentBuild.then(() => {
        return watcher.quit().then(() => {
          expect(adapterQuit).to.have.been.called;
          expect(trigger).to.have.been.calledWith('quitStart');
          expect(trigger).to.have.been.calledWith('quitEnd');
        });
      });
    })
  });
});
