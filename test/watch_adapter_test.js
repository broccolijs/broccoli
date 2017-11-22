'use strict';

const WatcherAdapter = require('../lib/watcher_adapter');
const bindFileEvent = WatcherAdapter.bindFileEvent;
const fs = require('fs');

const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const sinon = require('sinon');

describe('WatcherAdapter', function() {
  describe('bindFileEvent', function() {
    const adapter = {
      trigger() {},
    };

    const watcher = {
      on(name, cb) {
        cb();
      },
    };

    it('works', function() {
      const trigger = sinon.spy(adapter, 'trigger');
      const on = sinon.spy(watcher, 'on');

      expect(on).to.have.not.been.called;
      expect(trigger).to.have.not.been.called;

      bindFileEvent(adapter, watcher, 'change');

      expect(on).to.have.been.calledOnce;
      expect(trigger).to.have.been.calledOnce;
      expect(on).to.have.been.calledWith('change');
      expect(trigger).to.have.been.calledWith('change');

      bindFileEvent(adapter, watcher, 'add');

      expect(on).to.have.been.calledTwice;
      expect(trigger).to.have.been.calledTwice;
      expect(on).to.have.been.calledWith('add');
      expect(trigger).to.have.been.calledWith('change');

      bindFileEvent(adapter, watcher, 'remove');

      expect(on).to.have.been.calledThrice;
      expect(trigger).to.have.been.calledThrice;
      expect(on).to.have.been.calledWith('remove');
      expect(trigger).to.have.been.calledWith('change');
    });
  });

  describe('constructor', function() {
    it('does not support call constructor', function() {
      expect(() => WatcherAdapter()).to.throw(/\bwithout 'new'/);
    });

    it('has defaults', function() {
      const adapter = new WatcherAdapter();

      expect(adapter.options).to.have.keys('filter');
      expect(adapter.options.filter).to.have.be.a('Function');
    });

    it('supports custom options, but without filter', function() {
      const customOptions = {};
      const adapter = new WatcherAdapter(customOptions);

      expect(adapter.options).to.eql(customOptions);
      expect(adapter.options.filter).to.have.be.a('Function');
    });

    it('supports custom options, and allows for a  custom filter', function() {
      function filter() {}
      const customOptions = { filter };
      const adapter = new WatcherAdapter(customOptions);

      expect(adapter.options).to.eql(customOptions);
      expect(adapter.options.filter).to.eql(filter);
    });
  });

  describe('watch', function() {
    this.timeout(20000);

    const FIXTURE_BASIC = __dirname + '/fixtures/basic';
    const FIXTURE_PROJECT = __dirname + '/fixtures/project';
    let adapter;

    afterEach(function() {
      adapter.quit();
    });

    it('supports symmetric start/shutdown', function() {
      adapter = new WatcherAdapter();
    });

    it('throws if you try to watch a non array', function() {
      adapter = new WatcherAdapter();

      expect(() => adapter.watch()).to.throw(
        TypeError,
        `WatcherAdapter#watch's first argument must be an array of watchedPaths`
      );

      [null, undefined, NaN, {}, { length: 0 }, 'string', function() {}, Symbol('OMG')].forEach(
        arg => {
          expect(() => adapter.watch(arg)).to.throw(
            TypeError,
            `WatcherAdapter#watch's first argument must be an array of watchedPaths`
          );
        }
      );
    });

    it('actually works !!', function() {
      adapter = new WatcherAdapter();

      let trigger = sinon.spy(adapter, 'trigger');

      expect(trigger).to.have.callCount(0);

      expect(adapter.watchers.length).to.eql(0);
      let watching = adapter.watch([FIXTURE_BASIC]);

      expect(adapter.watchers.length).to.eql(1);

      return watching.then(function() {
        expect(arguments.length).to.eql(1);

        expect(trigger).to.have.callCount(0);
        fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
        fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

        return spin(() => expect(trigger).to.have.callCount(1), 10000).then(() => {
          expect(trigger).to.have.been.calledWith('change');

          // reset the spy
          trigger.reset();

          // this time also watch the FIXTURE_PROJECT
          let watching = adapter.watch([FIXTURE_PROJECT]);
          expect(adapter.watchers.length).to.eql(2);

          return watching.then(val => {
            expect(val).to.eql(undefined);

            fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
            fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

            return spin(() => expect(trigger).to.have.callCount(2), 10000)
              .then(() => {
                expect(trigger).to.have.been.calledWith('change');
              })
              .then(() => {
                trigger.reset();

                fs.utimesSync(FIXTURE_BASIC + '/foo.txt', new Date(), new Date());
                fs.utimesSync(FIXTURE_PROJECT + '/Brocfile.js', new Date(), new Date());

                expect(adapter.watchers.length).to.eql(2);
                let quitting = adapter.quit();
                expect(adapter.watchers.length).to.eql(0);
                return quitting.then(val => {
                  expect(val).to.eql(undefined);
                  return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      try {
                        expect(trigger).to.have.callCount(0);
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
});

function spin(cb, limit) {
  return new Promise((resolve, reject) => {
    let spinner;
    let cancel = setTimeout(() => {
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
