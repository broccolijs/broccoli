'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const RSVP = require('rsvp');
const tmp = require('tmp');
const broccoli = require('..');
const makePlugins = require('./plugins');
const Builder = broccoli.Builder;
const fixturify = require('fixturify');
const sinon = require('sinon');
const chai = require('chai'),
  expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const multidepRequire = require('multidep')('test/multidep.json');
const semver = require('semver');

const Plugin = multidepRequire('broccoli-plugin', '1.3.0');
const broccoliSource = multidepRequire('broccoli-source', '1.1.0');

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup();

RSVP.on('error', error => {
  throw error;
});

// Make a default set of plugins with the latest Plugin version. In some tests
// we'll shadow this `plugins` variable with one created with different versions.
const plugins = makePlugins(Plugin);

function sleep() {
  return new RSVP.Promise(resolve => setTimeout(resolve, 10));
}

// Builder subclass that returns fixturify objects from .build()
FixtureBuilder.prototype = Object.create(Builder.prototype);
FixtureBuilder.prototype.constructor = FixtureBuilder;
function FixtureBuilder(/* ... */) {
  Builder.apply(this, arguments);
}

FixtureBuilder.prototype.build = function() {
  return Builder.prototype.build.call(this).then(() => {
    return fixturify.readSync(this.outputPath);
  });
};

function buildToFixture(node) {
  const fixtureBuilder = new FixtureBuilder(node);
  return fixtureBuilder.build().finally(fixtureBuilder.cleanup.bind(fixtureBuilder));
}

describe('Builder', function() {
  if (process.env.CI) {
    this.timeout(120000);
  }

  let builder;

  afterEach(function() {
    if (builder) {
      builder.cleanup();
      builder = null;
    }
  });

  describe('broccoli-plugin nodes (nodeType: "transform")', function() {
    multidepRequire.forEachVersion('broccoli-plugin', function(version, Plugin) {
      const plugins = makePlugins(Plugin);

      describe('broccoli-plugin ' + version, function() {
        it('builds a single node, repeatedly', function() {
          const node = new plugins.VeggiesPlugin();
          const buildSpy = sinon.spy(node, 'build');

          builder = new FixtureBuilder(node);

          return expect(builder.build())
            .to.eventually.deep.equal({ 'veggies.txt': 'tasty' })
            .then(() => {
              return expect(builder.build()).to.eventually.deep.equal({ 'veggies.txt': 'tasty' });
            })
            .then(() => {
              expect(buildSpy).to.have.been.calledTwice;
            });
        });

        it('allows for asynchronous build', function() {
          const asyncNode = new plugins.AsyncPlugin();
          const outputNode = new plugins.MergePlugin([asyncNode]);
          const buildSpy = sinon.spy(outputNode, 'build');

          builder = new Builder(outputNode);

          const buildPromise = builder.build();

          return asyncNode.buildStarted
            .then(sleep)
            .then(() => {
              expect(buildSpy).not.to.have.been.called;
              asyncNode.finishBuild();
            })
            .then(() => buildPromise)
            .then(() => {
              expect(buildSpy).to.have.been.called;
            });
        });

        it('builds nodes reachable through multiple paths only once', function() {
          const src = new plugins.VeggiesPlugin();
          const buildSpy = sinon.spy(src, 'build');
          const outputNode = new plugins.MergePlugin([src, src], { overwrite: true });

          return expect(buildToFixture(outputNode))
            .to.eventually.deep.equal({
              '0': { 'veggies.txt': 'tasty' },
              '1': { 'veggies.txt': 'tasty' },
            })
            .then(() => {
              expect(buildSpy).to.have.been.calledOnce;
            });
        });

        it('supplies a cachePath by default', function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          CacheTestPlugin.prototype = Object.create(Plugin.prototype);
          CacheTestPlugin.prototype.constructor = CacheTestPlugin;
          function CacheTestPlugin() {
            Plugin.call(this, []);
          }
          CacheTestPlugin.prototype.build = function() {
            expect(fs.existsSync(this.cachePath)).to.be.true;
          };

          builder = new Builder(new CacheTestPlugin());
          return builder.build();
        });

        it('supplies a cachePath when requested', function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          CacheTestPlugin.prototype = Object.create(Plugin.prototype);
          CacheTestPlugin.prototype.constructor = CacheTestPlugin;
          function CacheTestPlugin() {
            Plugin.call(this, [], {
              needsCache: true,
            });
          }
          CacheTestPlugin.prototype.build = function() {
            expect(fs.existsSync(this.cachePath)).to.be.true;
          };

          builder = new Builder(new CacheTestPlugin());
          return builder.build();
        });
      });

      if (version === 'master' || semver.gt(version, '1.3.0')) {
        it('does not create a cachePath when opt-ed out', function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          CacheTestPlugin.prototype = Object.create(Plugin.prototype);
          CacheTestPlugin.prototype.constructor = CacheTestPlugin;
          function CacheTestPlugin() {
            Plugin.call(this, [], {
              needsCache: false,
            });
          }
          CacheTestPlugin.prototype.build = function() {
            expect(this.cachePath).to.equal(undefined);
          };

          builder = new Builder(new CacheTestPlugin());
          return builder.build();
        });
      }
    });

    describe('persistentOutput flag', function() {
      multidepRequire.forEachVersion('broccoli-plugin', (version, Plugin) => {
        BuildOncePlugin.prototype = Object.create(Plugin.prototype);
        BuildOncePlugin.prototype.constructor = BuildOncePlugin;

        function BuildOncePlugin(options) {
          Plugin.call(this, [], options);
        }

        BuildOncePlugin.prototype.build = function() {
          if (!this.builtOnce) {
            this.builtOnce = true;
            fs.writeFileSync(path.join(this.outputPath, 'foo.txt'), 'test');
          }
        };

        function isPersistent(options) {
          const builder = new FixtureBuilder(new BuildOncePlugin(options));

          return builder
            .build()
            .then(() => builder.build())
            .then(obj => obj['foo.txt'] === 'test')
            .finally(() => builder.cleanup());
        }

        describe('broccoli-plugin ' + version, function() {
          it('is not persistent by default', function() {
            return expect(isPersistent({})).to.be.eventually.false;
          });

          if (version !== '1.0.0') {
            it('is persistent with persistentOutput: true', function() {
              return expect(isPersistent({ persistentOutput: true })).to.be.eventually.true;
            });
          }
        });
      });
    });
  });

  describe('broccoli-source nodes (nodeType: "source") and strings', function() {
    multidepRequire.forEachVersion('broccoli-source', function(version, broccoliSource) {
      describe('broccoli-source ' + version, function() {
        it('records unwatched source directories', function() {
          builder = new FixtureBuilder(new broccoliSource.UnwatchedDir('test/fixtures/basic'));

          expect(builder.watchedPaths).to.deep.equal([]);
          expect(builder.unwatchedPaths).to.deep.equal(['test/fixtures/basic']);

          return expect(builder.build()).to.eventually.deep.equal({ 'foo.txt': 'OK' });
        });

        it('records watched source directories', function() {
          builder = new FixtureBuilder(new broccoliSource.WatchedDir('test/fixtures/basic'));

          expect(builder.watchedPaths).to.deep.equal(['test/fixtures/basic']);
          expect(builder.unwatchedPaths).to.deep.equal([]);

          return expect(builder.build()).to.eventually.deep.equal({ 'foo.txt': 'OK' });
        });
      });
    });

    it('records string (watched) source directories', function() {
      builder = new FixtureBuilder('test/fixtures/basic');

      expect(builder.watchedPaths).to.deep.equal(['test/fixtures/basic']);
      expect(builder.unwatchedPaths).to.deep.equal([]);

      return expect(builder.build()).to.eventually.deep.equal({ 'foo.txt': 'OK' });
    });

    it('records source directories only once', function() {
      const src = 'test/fixtures/basic';

      builder = new FixtureBuilder(new plugins.MergePlugin([src, src]));

      expect(builder.watchedPaths).to.deep.equal(['test/fixtures/basic']);
    });

    it("fails construction when a watched source directory doesn't exist", function() {
      expect(() => {
        new Builder(new broccoliSource.WatchedDir('test/fixtures/doesnotexist'));
      }).to.throw(Builder.BuilderError, 'Directory not found: test/fixtures/doesnotexist');
    });

    it('fails construction when a watched source directory is a file', function() {
      expect(() => {
        new Builder(new broccoliSource.WatchedDir('test/fixtures/basic/foo.txt'));
      }).to.throw(Builder.BuilderError, 'Not a directory: test/fixtures/basic/foo.txt');
    });

    it("fails when an unwatched source directory doesn't exist", function() {
      builder = new Builder(new broccoliSource.UnwatchedDir('test/fixtures/doesnotexist'));

      // Note: `ENOENT:` or `ENOENT,` depending on Node version
      return expect(builder.build()).to.be.eventually.rejectedWith(
        Builder.BuildError,
        /test\/fixtures\/doesnotexist: ENOENT. no such file or directory/
      );
    });

    it('fails when an unwatched source directory is a file', function() {
      builder = new Builder(new broccoliSource.UnwatchedDir('test/fixtures/basic/foo.txt'));

      return expect(builder.build()).to.be.eventually.rejectedWith(
        Builder.BuildError,
        /test\/fixtures\/basic\/foo\.txt: Not a directory/
      );
    });
  });

  describe('error handling in constructor', function() {
    it('detects cycles', function() {
      // Cycles are quite hard to construct, so we make a special plugin
      CyclicalPlugin.prototype = Object.create(Plugin.prototype);
      CyclicalPlugin.prototype.constructor = CyclicalPlugin;
      function CyclicalPlugin() {
        Plugin.call(this, [this]); // use `this` as input node
      }
      CyclicalPlugin.prototype.build = function() {};

      expect(() => {
        new Builder(new CyclicalPlugin());
      }).to.throw(Builder.BuilderError, 'Cycle in node graph: CyclicalPlugin -> CyclicalPlugin');
    });

    describe('invalid nodes', function() {
      const invalidNode = { 'not a node': true };
      const readBasedNode = {
        read() {},
        cleanup() {},
        description: 'an old node',
      };

      it('catches invalid root nodes', function() {
        expect(() => {
          new Builder(invalidNode);
        }).to.throw(
          Builder.InvalidNodeError,
          /\[object Object\] is not a Broccoli node\nused as output node$/
        );
      });

      it('catches invalid input nodes', function() {
        expect(() => {
          new Builder(new plugins.MergePlugin([invalidNode], { annotation: 'some annotation' }));
        }).to.throw(
          Builder.InvalidNodeError,
          /\[object Object\] is not a Broccoli node\nused as input node to MergePlugin \(some annotation\)\n-~- created here: -~-/
        );
      });

      it('catches undefined input nodes', function() {
        // Very common subcase of invalid input nodes
        expect(() => {
          new Builder(new plugins.MergePlugin([undefined], { annotation: 'some annotation' }));
        }).to.throw(
          /MergePlugin \(some annotation\): Expected Broccoli node, got undefined for inputNodes\[0\]/
        );
      });

      it('catches .read/.rebuild-based root nodes', function() {
        expect(() => {
          new Builder(readBasedNode);
        }).to.throw(
          Builder.InvalidNodeError,
          /an old node: The \.read\/\.rebuild API[^\n]*\nused as output node/
        );
      });

      it('catches .read/.rebuild-based input nodes', function() {
        expect(() => {
          new Builder(new plugins.MergePlugin([readBasedNode], { annotation: 'some annotation' }));
        }).to.throw(
          Builder.InvalidNodeError,
          /an old node: The \.read\/\.rebuild API[^\n]*\nused as input node to MergePlugin \(some annotation\)\n-~- created here: -~-/
        );
      });
    });
  });

  describe('temporary directories', function() {
    let tmpdir, tmpRemoveCallback;

    beforeEach(() => {
      const tmpObj = tmp.dirSync({ prefix: 'broccoli_builder_test-', unsafeCleanup: true });
      tmpdir = tmpObj.name;
      tmpRemoveCallback = tmpObj.removeCallback;
    });
    afterEach(() => {
      if (builder) {
        builder.cleanup();
        builder = null;
      }
      tmpRemoveCallback();
    });

    function hasBroccoliTmpDir(baseDir) {
      const entries = fs.readdirSync(baseDir);
      for (let i = 0; i < entries.length; i++) {
        if (/^broccoli-/.test(entries[i])) {
          return true;
        }
      }
      return false;
    }

    it('creates temporary directory in os.tmpdir() by default', function() {
      builder = new Builder(new plugins.VeggiesPlugin());
      // This can have false positives from other Broccoli instances, but it's
      // better than nothing, and better than trying to be sophisticated
      expect(hasBroccoliTmpDir(os.tmpdir())).to.be.true;
    });

    it('creates temporary directory in directory given by tmpdir options', function() {
      builder = new Builder(new plugins.VeggiesPlugin(), { tmpdir });
      expect(hasBroccoliTmpDir(tmpdir)).to.be.true;
    });

    it('removes temporary directory when .cleanup() is called', function() {
      builder = new Builder(new plugins.VeggiesPlugin(), { tmpdir });
      expect(hasBroccoliTmpDir(tmpdir)).to.be.true;
      builder.cleanup();
      builder = null;
      expect(hasBroccoliTmpDir(tmpdir)).to.be.false;
    });

    describe('failing node setup', function() {
      // Failing node setup is rare, but it could happen if a plugin fails to
      // create some compiler instance
      FailingSetupPlugin.prototype = Object.create(Plugin.prototype);
      FailingSetupPlugin.prototype.constructor = FailingSetupPlugin;
      function FailingSetupPlugin(errorObject) {
        Plugin.call(this, []);
        this.errorObject = errorObject;
      }
      FailingSetupPlugin.prototype.getCallbackObject = function() {
        throw this.errorObject;
      };

      it('reports failing node and instantiation stack, and cleans up temporary directory', function() {
        const node = new FailingSetupPlugin(new Error('foo error'));

        expect(() => {
          new Builder(node, { tmpdir });
        }).to.throw(
          Builder.NodeSetupError,
          /foo error\s+at FailingSetupPlugin\n-~- created here: -~-/
        );
        expect(hasBroccoliTmpDir(tmpdir)).to.be.false;
      });

      it('supports string errors, and cleans up temporary directory', function() {
        const node = new FailingSetupPlugin('bar error');

        expect(() => {
          new Builder(node, { tmpdir });
        }).to.throw(
          Builder.NodeSetupError,
          /bar error\s+at FailingSetupPlugin\n-~- created here: -~-/
        );
        expect(hasBroccoliTmpDir(tmpdir)).to.be.false;
      });
    });
  });

  describe('failing node build', function() {
    multidepRequire.forEachVersion('broccoli-plugin', function(version, Plugin) {
      const plugins = makePlugins(Plugin);

      describe('broccoli-plugin ' + version, function() {
        it('rethrows as rich BuildError', function() {
          const originalError = new Error('whoops');
          originalError.file = 'somefile.js';
          originalError.treeDir = '/some/dir';
          originalError.line = 42;
          originalError.column = 3;
          originalError.randomProperty = 'is ignored';

          let node = new plugins.FailingPlugin(originalError, { annotation: 'annotated' });
          // Wrapping in MergePlugin shouldn't make a difference. This way we
          // test that we don't have multiple catch clauses applying, wrapping
          // the error repeatedly
          node = new plugins.MergePlugin([node]);
          builder = new Builder(node);

          return builder.build().then(
            () => {
              throw new Error('Expected an error');
            },
            err => {
              expect(err).to.be.an.instanceof(Builder.BuildError);
              expect(err.stack).to.equal(originalError.stack, 'preserves original stack');

              expect(err.message).to.match(
                /somefile.js:42:4: whoops\s+in \/some\/dir\s+at FailingPlugin \(annotated\)/
              );
              expect(err.message).not.to.match(
                /created here/,
                'suppresses instantiation stack when .file is supplied'
              );

              expect(err.broccoliPayload.originalError).to.equal(originalError);

              // Reports offending node
              expect(err.broccoliPayload.nodeId).to.equal(0);
              expect(err.broccoliPayload.nodeLabel).to.equal('FailingPlugin (annotated)');
              expect(err.broccoliPayload.nodeName).to.equal('FailingPlugin');
              expect(err.broccoliPayload.nodeAnnotation).to.equal('annotated');
              expect(err.broccoliPayload.instantiationStack).to.be.a('string');

              // Passes on special properties
              expect(err.broccoliPayload.location).to.deep.equal({
                file: 'somefile.js',
                treeDir: '/some/dir',
                line: 42,
                column: 3,
              });
              expect(err.broccoliPayload).not.to.have.property('randomProperty');
            }
          );
        });

        it('reports the instantiationStack when no err.file is given', function() {
          const originalError = new Error('whoops');

          builder = new Builder(new plugins.FailingPlugin(originalError));
          return expect(builder.build()).to.be.rejectedWith(
            Builder.BuildError,
            /whoops\s+at FailingPlugin\n-~- created here: -~-/
          );
        });

        it('handles string errors', function() {
          builder = new Builder(new plugins.FailingPlugin('string exception'));
          return expect(builder.build()).to.be.rejectedWith(Builder.BuildError, /string exception/);
        });

        it('handles undefined errors', function() {
          // Apparently that's a thing
          builder = new Builder(new plugins.FailingPlugin(undefined));
          return expect(builder.build()).to.be.rejectedWith(Builder.BuildError, /undefined/);
        });
      });
    });
  });

  describe('event handling', function() {
    let events;

    function setupEventHandlers() {
      events = [];
      builder.on('beginNode', nw => events.push('beginNode:' + nw.id));
      builder.on('endNode', nw => events.push('endNode:' + nw.id));
    }

    it('triggers RSVP events', () => {
      builder = new Builder(
        new plugins.MergePlugin([new plugins.VeggiesPlugin(), 'test/fixtures/basic'])
      );
      setupEventHandlers();
      return builder.build().then(() => {
        expect(events).to.deep.equal([
          'beginNode:0',
          'endNode:0',
          'beginNode:1',
          'endNode:1',
          'beginNode:2',
          'endNode:2',
        ]);
      });
    });

    it('triggers matching endNode event when a node fails to build', function() {
      builder = new Builder(
        new plugins.MergePlugin([new plugins.FailingPlugin(new Error('whoops'))])
      );
      setupEventHandlers();
      return expect(builder.build()).to.be.rejected.then(() => {
        expect(events).to.deep.equal(['beginNode:0', 'endNode:0']);
      });
    });
  });

  describe('node wrappers', function() {
    // It would be easier to test the node wrappers if we could create them
    // without instantiating a builder, but unfortunately this isn't easily
    // possible right now.

    let watchedSourceNw, unwatchedSourceNw, transformNw;

    function setUpWatchedUnwatchedAndTransformNode() {
      const watchedSourceNode = new broccoliSource.WatchedDir('test/fixtures/basic');
      const unwatchedSourceNode = new broccoliSource.UnwatchedDir('test/fixtures/basic');
      const transformNode = new plugins.MergePlugin([watchedSourceNode, unwatchedSourceNode], {
        overwrite: true,
      });
      builder = new Builder(transformNode);
      watchedSourceNw = builder.nodeWrappers[0];
      unwatchedSourceNw = builder.nodeWrappers[1];
      transformNw = builder.nodeWrappers[2];
    }

    it('has .toString value useful for debugging', function() {
      setUpWatchedUnwatchedAndTransformNode();
      expect(watchedSourceNw + '').to.equal('[NodeWrapper:0 test/fixtures/basic]');
      expect(unwatchedSourceNw + '').to.equal('[NodeWrapper:1 test/fixtures/basic (unwatched)]');
      expect(transformNw + '').to.match(
        /\[NodeWrapper:2 MergePlugin inputNodeWrappers:\[0,1\] at .+\]/
      );

      // Reports timing after first build
      expect(transformNw + '').not.to.match(/\([0-9]+ ms\)/);
      return builder.build().then(() => {
        expect(transformNw + '').to.match(/\([0-9]+ ms\)/);
      });
    });

    it('has .label property', function() {
      const node0 = new broccoliSource.WatchedDir('test/fixtures/basic');
      const node1 = new broccoliSource.WatchedDir('test/fixtures/basic', {
        annotation: 'some text',
      });
      const node2 = new plugins.MergePlugin([node0, node1]);
      const node3 = new plugins.MergePlugin([node2], { annotation: 'some text' });
      builder = new Builder(node3);
      expect(builder.nodeWrappers[0].label).to.equal('WatchedDir (test/fixtures/basic)');
      expect(builder.nodeWrappers[1].label).to.equal('WatchedDir (test/fixtures/basic; some text)');
      expect(builder.nodeWrappers[2].label).to.equal('MergePlugin');
      expect(builder.nodeWrappers[3].label).to.equal('MergePlugin (some text)');
    });

    it('has .toJSON representation useful for exporting for visualization', function() {
      setUpWatchedUnwatchedAndTransformNode();
      expect(watchedSourceNw.toJSON()).to.deep.equal({
        id: 0,
        nodeInfo: {
          nodeType: 'source',
          sourceDirectory: 'test/fixtures/basic',
          watched: true,
          name: 'WatchedDir',
          annotation: null,
        },
        label: 'WatchedDir (test/fixtures/basic)',
        inputNodeWrappers: [],
        cachePath: null,
        outputPath: 'test/fixtures/basic',
        buildState: {},
      });

      return builder.build().then(() => {
        const transformNwJSON = transformNw.toJSON();

        // Fuzzy matches first
        expect(transformNwJSON.cachePath).to.be.a('string');
        expect(transformNwJSON.outputPath).to.be.a('string');
        transformNwJSON.cachePath = '/some/path';
        transformNwJSON.outputPath = '/some/path';
        expect(transformNwJSON.buildState.selfTime).to.be.a('number');
        expect(transformNwJSON.buildState.totalTime).to.be.a('number');
        transformNwJSON.buildState.selfTime = 1;
        transformNwJSON.buildState.totalTime = 1;

        expect(transformNwJSON).to.deep.equal({
          id: 2,
          nodeInfo: {
            nodeType: 'transform',
            name: 'MergePlugin',
            annotation: null,
            persistentOutput: false,
            needsCache: true,
          },
          buildState: {
            selfTime: 1,
            totalTime: 1,
          },
          label: 'MergePlugin',
          inputNodeWrappers: [0, 1],
          cachePath: '/some/path',
          outputPath: '/some/path',
        });
      });
    });

    describe('buildState', function() {
      it('reports node timings', function() {
        const node1 = new plugins.SleepingPlugin(['test/fixtures/basic']);
        const node2 = new plugins.SleepingPlugin();
        const outputNode = new plugins.SleepingPlugin([node1, node2]);

        builder = new Builder(outputNode);

        return builder.build().then(() => {
          const sourceNw = builder.nodeWrappers[0];
          const nw1 = builder.nodeWrappers[1];
          const nw2 = builder.nodeWrappers[2];
          const outputNw = builder.nodeWrappers[3];

          expect(sourceNw.buildState.selfTime).to.equal(0);
          expect(sourceNw.buildState.totalTime).to.equal(0);

          expect(nw1.buildState.selfTime).to.be.greaterThan(0);
          expect(nw1.buildState.totalTime).to.equal(nw1.buildState.selfTime);
          expect(nw2.buildState.selfTime).to.be.greaterThan(0);
          expect(nw2.buildState.totalTime).to.equal(nw2.buildState.selfTime);

          expect(outputNw.buildState.selfTime).to.be.greaterThan(0);
          expect(outputNw.buildState.totalTime).to.equal(
            // addition order matters here, or rounding errors will occur
            outputNw.buildState.selfTime + nw1.buildState.selfTime + nw2.buildState.selfTime
          );
        });
      });
    });
  });

  describe('Builder interface', function() {
    it('has a features hash', function() {
      expect(Builder.prototype).to.have.nested.property('features.persistentOutputFlag', true);
    });
  });
});
