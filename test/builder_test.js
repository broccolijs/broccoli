import fs from 'fs';
import os from 'os';
import path from 'path';
import tmp from 'tmp';
import broccoli from '..';
import BuilderError from '../lib/errors/build';
import makePlugins from './plugins';
import fixturify from 'fixturify';
import Sinon from 'sinon';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';
import MultidepRequire from './utils/multidep/index';
import semver from 'semver';
import heimdall from 'heimdalljs';

const multidepRequire = MultidepRequire('test/multidep.json');
const Plugin = multidepRequire('broccoli-plugin', '1.3.0');
const broccoliSource = multidepRequire('broccoli-source', '1.1.0');
const isWin = os.platform() === 'win32';

const Builder = broccoli.Builder;
const expect = chai.expect;
chai.use(chaiAsPromised);
chai.use(sinonChai);
const sinon = Sinon.createSandbox();

// Clean up left-over temporary directories on uncaught exception.
tmp.setGracefulCleanup();

function wait(time) {
  return new Promise(resolve => setTimeout(resolve, time || 0));
}
// Make a default set of plugins with the latest Plugin version. In some tests
// we'll shadow this `plugins` variable with one created with different versions.
const plugins = makePlugins(Plugin);

function sleep() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

class FixtureBuilder extends Builder {
  async build() {
    await super.build();
    return fixturify.readSync(this.outputPath);
  }
}

async function buildToFixture(node) {
  const fixtureBuilder = new FixtureBuilder(node);
  try {
    return await fixtureBuilder.build();
  } finally {
    await fixtureBuilder.cleanup();
  }
}

describe('Builder', function() {
  if (process.env.CI) {
    this.timeout(120000);
  }

  let builder;

  beforeEach(function() {
    heimdall._reset();
  });

  afterEach(function() {
    sinon.restore();

    if (builder) {
      builder.cleanup();
      builder = null;
    }
  });

  it('has static members that are part of the public API', function() {
    expect(Builder.BuilderError).to.be.ok;
    expect(Builder.InvalidNodeError).to.be.ok;
    expect(Builder.NodeSetupError).to.be.ok;
    expect(Builder.BuildError).to.be.ok;
    expect(Builder.NodeWrapper).to.be.ok;
    expect(Builder.TransformNodeWrapper).to.be.ok;
    expect(Builder.SourceNodeWrapper).to.be.ok;
  });

  describe('build result', function() {
    it('returns a promise', function() {
      const stepA = new plugins.Noop();
      const builder = new Builder(stepA);
      const promise = builder.build();
      expect(promise).to.be.an.instanceOf(Promise);
    });

    it('promise resolves to a node', function() {
      const stepA = new plugins.Noop();
      const builder = new Builder(stepA);
      const promise = builder.build();

      return promise;
    });
  });

  describe('broccoli-plugin nodes (nodeType: "transform")', function() {
    multidepRequire.forEachVersion('broccoli-plugin', function(version, Plugin) {
      const plugins = makePlugins(Plugin);

      describe('broccoli-plugin ' + version, function() {
        afterEach(() => {
          delete process.env['BROCCOLI_ENABLED_MEMOIZE'];
        });

        it('builds a single node, repeatedly', async function() {
          const node = new plugins.Veggies();
          const buildSpy = sinon.spy(node, 'build');

          builder = new FixtureBuilder(node);

          await expect(builder.build()).to.eventually.deep.equal({ 'veggies.txt': 'tasty' });
          await expect(builder.build()).to.eventually.deep.equal({
            'veggies.txt': 'tasty',
          });

          expect(buildSpy).to.have.been.calledTwice;
        });

        it('allows for asynchronous build', async function() {
          const asyncNode = new plugins.Async();
          const outputNode = new plugins.Merge([asyncNode]);
          const buildSpy = sinon.spy(outputNode, 'build');

          builder = new Builder(outputNode);

          const buildPromise = builder.build();

          await asyncNode.buildStarted;
          await sleep();
          expect(buildSpy).not.to.have.been.called;
          asyncNode.finishBuild();
          await buildPromise;
          expect(buildSpy).to.have.been.called;
        });

        it('builds nodes reachable through multiple paths only once', async function() {
          const src = new plugins.Veggies();
          const buildSpy = sinon.spy(src, 'build');
          const outputNode = new plugins.Merge([src, src], { overwrite: true });

          await expect(buildToFixture(outputNode)).to.eventually.deep.equal({
            '0': { 'veggies.txt': 'tasty' },
            '1': { 'veggies.txt': 'tasty' },
          });
          expect(buildSpy).to.have.been.calledOnce;
        });

        it('builds if revision counter has incremented', async function() {
          process.env['BROCCOLI_ENABLED_MEMOIZE'] = true;

          const outputNode = new plugins.Merge([
            new broccoliSource.WatchedDir('test/fixtures/basic'),
            new broccoliSource.WatchedDir('test/fixtures/public'),
          ]);

          const buildSpy = sinon.spy(outputNode, 'build');

          builder = new FixtureBuilder(outputNode);

          await builder.build();
          expect(buildSpy).to.have.been.calledOnce;

          // Now we simulate a rebuild (and the revisions have not changed)
          await builder.build();
          expect(buildSpy).to.have.been.calledOnce;
        });

        it('nodes with inputs that have different revisions call their builds', async function() {
          process.env['BROCCOLI_ENABLED_MEMOIZE'] = true;

          const basicWatchDir = new broccoliSource.WatchedDir('test/fixtures/basic');
          const publicWatchDir = new broccoliSource.WatchedDir('test/fixtures/public');

          const fooNode = new plugins.Merge([basicWatchDir], { overwrite: true });
          const barNode = new plugins.Merge([publicWatchDir], { overwrite: true });
          const outputNode = new plugins.Merge([fooNode, barNode], { overwrite: true });
          const fooBuildSpy = sinon.spy(fooNode, 'build');
          const barBuildSpy = sinon.spy(barNode, 'build');
          const buildSpy = sinon.spy(outputNode, 'build');

          builder = new FixtureBuilder(outputNode);

          await builder.build();
          expect(fooBuildSpy).to.have.been.calledOnce;
          expect(barBuildSpy).to.have.been.calledOnce;
          expect(buildSpy).to.have.been.calledOnce;

          builder.nodeWrappers.find(wrap => wrap.outputPath === 'test/fixtures/basic').revise();

          await builder.build();
          expect(fooBuildSpy).to.have.been.calledTwice;
          expect(barBuildSpy).to.have.been.calledOnce;
          expect(buildSpy).to.have.been.calledTwice;
        });

        it('supplies a cachePath by default', async function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          class CacheTestPlugin extends Plugin {
            constructor() {
              super([]);
            }

            build() {
              expect(fs.existsSync(this.cachePath)).to.be.true;
            }
          }

          builder = new Builder(new CacheTestPlugin());
          await builder.build();
        });

        it('supplies a cachePath when requested', async function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          class CacheTestPlugin extends Plugin {
            constructor() {
              super([], {
                needsCache: true,
              });
            }

            build() {
              expect(fs.existsSync(this.cachePath)).to.be.true;
            }
          }

          builder = new Builder(new CacheTestPlugin());
          await builder.build();
        });
      });

      if (version === 'master' || semver.gt(version, '1.3.0')) {
        it('does not create a cachePath when opt-ed out', async function() {
          // inputPath and outputPath are tested implicitly by the other tests,
          // but cachePath isn't, so we have this test case

          class CacheTestPlugin extends Plugin {
            constructor() {
              super([], {
                needsCache: false,
              });
            }

            build() {
              expect(this.cachePath).to.equal(undefined);
            }
          }

          builder = new Builder(new CacheTestPlugin());
          await builder.build();
        });
      }
    });

    describe('persistentOutput flag', function() {
      multidepRequire.forEachVersion('broccoli-plugin', (version, Plugin) => {
        class BuildOncePlugin extends Plugin {
          constructor(options) {
            super([], options);
          }

          build() {
            if (!this.builtOnce) {
              this.builtOnce = true;
              fs.writeFileSync(path.join(this.outputPath, 'foo.txt'), 'test');
            }
          }
        }

        async function isPersistent(options) {
          const builder = new FixtureBuilder(new BuildOncePlugin(options));

          try {
            await builder.build();
            const obj = await builder.build();
            return obj['foo.txt'] === 'test';
          } finally {
            await builder.cleanup();
          }
        }

        describe('broccoli-plugin ' + version, function() {
          it('is not persistent by default', async function() {
            await expect(isPersistent({})).to.be.eventually.false;
          });

          if (version !== '1.0.0') {
            it('is persistent with persistentOutput: true', async function() {
              await expect(isPersistent({ persistentOutput: true })).to.be.eventually.true;
            });
          }
        });
      });
    });
  });

  describe('broccoli-source nodes (nodeType: "source") and strings', function() {
    multidepRequire.forEachVersion('broccoli-source', function(version, broccoliSource) {
      describe('broccoli-source ' + version, function() {
        it('records unwatched source directories', async function() {
          builder = new FixtureBuilder(
            new broccoliSource.UnwatchedDir(path.resolve('test/fixtures/basic'))
          );

          expect(builder.watchedPaths).to.deep.equal([]);
          expect(builder.unwatchedPaths).to.deep.equal([path.resolve('test/fixtures/basic')]);

          await expect(builder.build()).to.eventually.deep.equal({
            'foo.txt': 'OK',
          });
        });

        it('records watched source directories', async function() {
          builder = new FixtureBuilder(
            new broccoliSource.WatchedDir(path.resolve('test/fixtures/basic'))
          );

          expect(builder.watchedPaths).to.deep.equal([path.resolve('test/fixtures/basic')]);
          expect(builder.unwatchedPaths).to.deep.equal([]);

          await expect(builder.build()).to.eventually.deep.equal({
            'foo.txt': 'OK',
          });
        });
      });
    });

    it('records string (watched) source directories', async function() {
      builder = new FixtureBuilder('test/fixtures/basic');

      expect(builder.watchedPaths).to.deep.equal([path.resolve('test/fixtures/basic')]);
      expect(builder.unwatchedPaths).to.deep.equal([]);

      await expect(builder.build()).to.eventually.deep.equal({
        'foo.txt': 'OK',
      });
    });

    it('records source directories only once', function() {
      const src = 'test/fixtures/basic';

      builder = new FixtureBuilder(new plugins.Merge([src, src]));

      expect(builder.watchedPaths).to.deep.equal([path.resolve('test/fixtures/basic')]);
    });

    it("fails construction when a watched source directory doesn't exist", function() {
      expect(() => {
        new Builder(new broccoliSource.WatchedDir('test/fixtures/does-not-exist'));
      }).to.throw(Builder.BuilderError, 'Directory not found: test/fixtures/does-not-exist');
    });

    it('fails construction when a watched source directory is a file', function() {
      expect(() => {
        new Builder(new broccoliSource.WatchedDir('test/fixtures/basic/foo.txt'));
      }).to.throw(Builder.BuilderError, 'Not a directory: test/fixtures/basic/foo.txt');
    });

    it("fails when an unwatched source directory doesn't exist", async function() {
      builder = new Builder(new broccoliSource.UnwatchedDir('test/fixtures/does-not-exist'));

      // Note: `ENOENT:` or `ENOENT,` depending on Node version
      await expect(builder.build()).to.be.eventually.rejectedWith(
        Builder.BuildError,
        /test\/fixtures\/does-not-exist: ENOENT. no such file or directory/
      );
    });

    it('fails when an unwatched source directory is a file', async function() {
      builder = new Builder(new broccoliSource.UnwatchedDir('test/fixtures/basic/foo.txt'));

      await expect(builder.build()).to.be.eventually.rejectedWith(
        Builder.BuildError,
        /test\/fixtures\/basic\/foo\.txt: Not a directory/
      );
    });

    it('returns only watched SourceNodeWrappers from watchedSourceNodeWrappers', function() {
      const source1 = new broccoliSource.WatchedDir('test/fixtures/basic/');
      const source2 = new broccoliSource.UnwatchedDir('test/fixtures/empty/');
      builder = new Builder(new plugins.Merge([source1, source2]));

      const watchedSourceNodeWrappers = builder.watchedSourceNodeWrappers;

      expect(watchedSourceNodeWrappers).length.to.be(1);
      expect(watchedSourceNodeWrappers[0].node).to.equal(source1);
    });
  });

  describe('error handling in constructor', function() {
    it('detects cycles', function() {
      function CyclicalPlugin() {
        Plugin.call(this, [this]); // use `this` as input node
      }
      // Cycles are quite hard to construct, so we make a special plugin
      CyclicalPlugin.prototype = Object.create(Plugin.prototype);
      CyclicalPlugin.prototype.constructor = CyclicalPlugin;
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
          new Builder(new plugins.Merge([invalidNode], { annotation: 'some annotation' }));
        }).to.throw(
          Builder.InvalidNodeError,
          /\[object Object\] is not a Broccoli node\nused as input node to MergePlugin \(some annotation\)\n-~- created here: -~-/
        );
      });

      it('catches undefined input nodes', function() {
        // Very common sub-case of invalid input nodes
        expect(() => {
          new Builder(new plugins.Merge([undefined], { annotation: 'some annotation' }));
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
          new Builder(
            new plugins.Merge([readBasedNode], {
              annotation: 'some annotation',
            })
          );
        }).to.throw(
          Builder.InvalidNodeError,
          /an old node: The \.read\/\.rebuild API[^\n]*\nused as input node to MergePlugin \(some annotation\)\n-~- created here: -~-/
        );
      });
    });
  });

  describe('cleanup', function() {
    let builder;

    class Sleep extends Plugin {
      constructor() {
        // eslint-disable-next-line prefer-rest-params
        super(...arguments);
        this.buildWasCalled = false;
        this.wait = new Promise(resolve => {
          this.resolve = resolve;
        });
      }

      async build() {
        this.buildWasCalled = true;
        await this.wait;
      }
    }

    afterEach(async () => {
      if (builder) {
        await builder.cleanup();
      }
    });

    it('mid-build cleanup cancels the build', async function() {
      const innerSleep = new Sleep([], { name: 'Sleep 1' });
      const outerSleep = new Sleep([innerSleep], { name: 'Sleep 2' });

      builder = new Builder(outerSleep);

      const cleanup = innerSleep.wait.then(async () => {
        expect(innerSleep.buildWasCalled).to.eql(true);
        expect(outerSleep.buildWasCalled).to.eql(false);
        await builder.cleanup();
      });

      const build = builder.build();

      setTimeout(() => innerSleep.resolve(), 10);

      expect(innerSleep.buildWasCalled).to.eql(false);
      expect(outerSleep.buildWasCalled).to.eql(false);

      await Promise.all([
        build.catch(e => {
          expect(e.message).to.eql('Build Canceled');
        }),
        cleanup,
      ]);

      expect(innerSleep.buildWasCalled).to.eql(true);
      expect(outerSleep.buildWasCalled).to.eql(false);
    });
  });

  describe('temporary directories', function() {
    let tmpdir, tmpRemoveCallback;

    beforeEach(() => {
      const tmpObj = tmp.dirSync({
        prefix: 'broccoli_builder_test-',
        unsafeCleanup: true,
      });
      tmpdir = tmpObj.name;
      tmpRemoveCallback = tmpObj.removeCallback;
    });

    afterEach(async () => {
      if (builder) {
        await builder.cleanup();
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
      builder = new Builder(new plugins.Veggies());
      // This can have false positives from other Broccoli instances, but it's
      // better than nothing, and better than trying to be sophisticated
      expect(hasBroccoliTmpDir(os.tmpdir())).to.be.true;
    });

    it('creates temporary directory in directory given by tmpdir options', function() {
      builder = new Builder(new plugins.Veggies(), { tmpdir });
      expect(hasBroccoliTmpDir(tmpdir)).to.be.true;
    });

    it('removes temporary directory when .cleanup() is called', async function() {
      builder = new Builder(new plugins.Veggies(), { tmpdir });
      expect(hasBroccoliTmpDir(tmpdir), 'should have tmpdir').to.be.true;
      await builder.cleanup();
      expect(hasBroccoliTmpDir(tmpdir), 'should not longer have tmpdir').to.be.false;
    });

    describe('failing node setup', function() {
      // Failing node setup is rare, but it could happen if a plugin fails to
      // create some compiler instance

      class FailingSetupPlugin extends Plugin {
        constructor(errorObject) {
          super([]);
          this.errorObject = errorObject;
        }

        getCallbackObject() {
          throw this.errorObject;
        }
      }

      it('reports failing node and instantiation stack, and cleans up temporary directory', async function() {
        const node = new FailingSetupPlugin(new Error('foo error'));

        expect(() => {
          new Builder(node, { tmpdir });
        }).to.throw(
          Builder.NodeSetupError,
          /foo error\s+at FailingSetupPlugin\n-~- created here: -~-/
        );

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(hasBroccoliTmpDir(tmpdir)).to.be.false;
      });

      it('supports string errors, and cleans up temporary directory', async function() {
        const node = new FailingSetupPlugin('bar error');

        expect(() => {
          new Builder(node, { tmpdir });
        }).to.throw(
          Builder.NodeSetupError,
          /bar error\s+at FailingSetupPlugin\n-~- created here: -~-/
        );

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(hasBroccoliTmpDir(tmpdir)).to.be.false;
      });
    });
  });

  describe('failing node build', function() {
    multidepRequire.forEachVersion('broccoli-plugin', function(version, Plugin) {
      const plugins = makePlugins(Plugin);

      describe('broccoli-plugin ' + version, function() {
        it('rethrows as rich BuildError', async function() {
          const originalError = new Error('whoops');
          originalError.file = 'some-file.js';
          originalError.treeDir = '/some/dir';
          originalError.line = 42;
          originalError.column = 3;
          originalError.randomProperty = 'is ignored';

          let node = new plugins.Failing(originalError, {
            annotation: 'annotated',
          });
          // Wrapping in MergePlugin shouldn't make a difference. This way we
          // test that we don't have multiple catch clauses applying, wrapping
          // the error repeatedly
          node = new plugins.Merge([node]);
          builder = new Builder(node);

          try {
            await builder.build();
            expect.fail('expected rejection');
          } catch (err) {
            expect(err.constructor.name).to.equal(BuilderError.name);
            expect(err.stack).to.equal(originalError.stack, 'preserves original stack');

            expect(err.message).to.match(
              /some-file.js:42:4: whoops\s+in \/some\/dir\s+at FailingPlugin \(annotated\)/
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
              file: 'some-file.js',
              treeDir: '/some/dir',
              line: 42,
              column: 3,
            });
            expect(err.broccoliPayload).not.to.have.property('randomProperty');
          }
        });

        it('reports the instantiationStack when no err.file is given', async function() {
          const originalError = new Error('whoops');

          builder = new Builder(new plugins.Failing(originalError));
          await expect(builder.build()).to.be.rejectedWith(
            Builder.BuildError,
            /whoops\s+at FailingPlugin\n-~- created here: -~-/
          );
        });

        it('handles string errors', async function() {
          builder = new Builder(new plugins.Failing('string exception'));
          await expect(builder.build()).to.be.rejectedWith(Builder.BuildError, /string exception/);
        });

        it('handles undefined errors', async function() {
          // Apparently that's a thing
          builder = new Builder(new plugins.Failing(undefined));
          await expect(builder.build()).to.be.rejectedWith(Builder.BuildError, /undefined/);
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

    it('triggers RSVP events', async () => {
      builder = new Builder(new plugins.Merge([new plugins.Veggies(), 'test/fixtures/basic']));
      setupEventHandlers();
      await builder.build();
      expect(events).to.deep.equal([
        'beginNode:0',
        'endNode:0',
        'beginNode:1',
        'endNode:1',
        'beginNode:2',
        'endNode:2',
      ]);
    });

    it('triggers matching endNode event when a node fails to build', async function() {
      builder = new Builder(new plugins.Merge([new plugins.Failing(new Error('whoops'))]));
      setupEventHandlers();
      await expect(builder.build()).to.be.rejected;
      expect(events).to.deep.equal(['beginNode:0', 'endNode:0']);
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
      const transformNode = new plugins.Merge([watchedSourceNode, unwatchedSourceNode], {
        overwrite: true,
      });
      builder = new Builder(transformNode);
      watchedSourceNw = builder.nodeWrappers[0];
      unwatchedSourceNw = builder.nodeWrappers[1];
      transformNw = builder.nodeWrappers[2];
    }

    it('has .toString value useful for debugging', async function() {
      setUpWatchedUnwatchedAndTransformNode();
      expect(watchedSourceNw + '').to.equal('[NodeWrapper:0 test/fixtures/basic]');
      expect(unwatchedSourceNw + '').to.equal('[NodeWrapper:1 test/fixtures/basic (unwatched)]');
      expect(transformNw + '').to.match(
        /\[NodeWrapper:2 MergePlugin inputNodeWrappers:\[0,1\] at .+\]/
      );

      // Reports timing after first build
      expect(transformNw + '').not.to.match(/\([0-9]+ ms\)/);
      await builder.build();
      expect(transformNw + '').to.match(/\([0-9]+ ms\)/);
    });

    it('has .label property', function() {
      const node0 = new broccoliSource.WatchedDir('test/fixtures/basic');
      const node1 = new broccoliSource.WatchedDir('test/fixtures/basic', {
        annotation: 'some text',
      });
      const node2 = new plugins.Merge([node0, node1]);
      const node3 = new plugins.Merge([node2], { annotation: 'some text' });
      builder = new Builder(node3);
      expect(builder.nodeWrappers[0].label).to.equal('WatchedDir (test/fixtures/basic)');
      expect(builder.nodeWrappers[1].label).to.equal('WatchedDir (test/fixtures/basic; some text)');
      expect(builder.nodeWrappers[2].label).to.equal('MergePlugin');
      expect(builder.nodeWrappers[3].label).to.equal('MergePlugin (some text)');
    });

    it('has .toJSON representation useful for exporting for visualization', async function() {
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

      await builder.build();
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

    describe('buildState', function() {
      it('reports node timings', async function() {
        const node1 = new plugins.Sleeping(['test/fixtures/basic']);
        const node2 = new plugins.Sleeping();
        const outputNode = new plugins.Sleeping([node1, node2]);

        builder = new Builder(outputNode);

        await builder.build();

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

  describe('Builder interface', function() {
    it('has a features hash', function() {
      expect(Builder.prototype).to.have.nested.property('features.persistentOutputFlag', true);
    });
  });

  describe('cancel()', function() {
    it('handles a cancel without an active build (has no affect)', async function() {
      const stepA = new plugins.Noop();
      const pipeline = new Builder(stepA);

      pipeline.cancel();
      pipeline.cancel(); // ensure double cancel is always safe here

      expect(stepA.buildCount).to.eql(0);

      await pipeline.build();
      expect(stepA.buildCount).to.eql(1);
    });

    it('returns a promise which waits until cancellation is complete', async function() {
      let resolveCancel;
      let stepAIsComplete = false;
      let cancellingIsComplete = false;

      class StepA extends plugins.Deferred {
        async build() {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          resolveCancel(pipeline.cancel());

          setTimeout(() => this.resolve(), 50);

          await super.build();
          stepAIsComplete = true;
          expect(cancellingIsComplete).to.eql(
            false,
            'expected cancelling to not complete before stepA'
          );
        }
      }

      const stepA = new StepA();
      const stepB = new plugins.Deferred([stepA]);

      const pipeline = new Builder(stepB);

      const building = expect(pipeline.build()).to.eventually.be.rejectedWith('Build Canceled');

      const cancelling = new Promise(resolve => (resolveCancel = resolve));

      await Promise.all([
        building,
        cancelling.then(() => {
          cancellingIsComplete = true;
          expect(stepAIsComplete).to.eql(
            true,
            'expected stepA to be complete before cancel completes'
          );
        }),
      ]);
    });

    it('errors if a new build is attempted during a cancellation', async function() {
      const stepA = new plugins.Deferred();
      const pipeline = new Builder(stepA);
      const build = pipeline.build();

      await wait();

      const next = Promise.all([
        expect(build).to.eventually.be.fulfilled,
        pipeline.cancel(),
        expect(pipeline.build()).to.eventually.be.rejectedWith(
          'Cannot start a build if one is already running'
        ),
        expect(pipeline.build()).to.eventually.be.rejectedWith(
          'Cannot start a build if one is already running'
        ),
        expect(pipeline.build()).to.eventually.be.rejectedWith(
          'Cannot start a build if one is already running'
        ),
      ]);

      stepA.resolve();

      return next;
    });

    it('build before cancel completes', async function() {
      const stepA = new plugins.Noop();
      const pipeline = new Builder(stepA);

      pipeline.cancel();
      pipeline.cancel(); // ensure double cancel is always safe here

      expect(stepA.buildCount).to.eql(0);

      await pipeline.build();
      expect(stepA.buildCount).to.eql(1);
    });

    it('it cancels immediately if cancelled immediately after build', async function() {
      const step = new plugins.Deferred();
      const pipeline = new Builder(step);
      step.resolve();
      const build = pipeline.build();
      pipeline.cancel();

      try {
        await expect(build).to.eventually.be.rejectedWith('Build Canceled');
      } finally {
        expect(step.buildCount).to.eql(0);
      }
    });

    it('completes the current task before cancelling, and can be resumed', async function() {
      // eslint-disable-next-line prefer-const
      let pipeline;

      class SometimesBuildCanceller extends plugins.Noop {
        async build() {
          super.build();

          // cancel the first build, but allow the rest to proceed
          if (this.buildCount === 1 || this.buildCount === 3) {
            pipeline.cancel();
          }
        }
      }

      const stepA = new SometimesBuildCanceller();

      const stepB = new plugins.Noop([stepA]);
      const stepC = new plugins.Noop([stepB]);

      pipeline = new Builder(stepC);

      // build #1
      // once the build has begun:
      // 1. allow StepA to complete
      // 2. cancel the build
      // 3. wait for the build settle
      //   (stepB and stepC should not have run)

      await expect(pipeline.build()).to.eventually.be.rejectedWith('Build Canceled');

      expect(stepA.buildCount).to.eql(1, 'stepA.buildCount');
      expect(stepB.buildCount).to.eql(0, 'stepB.buildCount');
      expect(stepC.buildCount).to.eql(0, 'stepC.buildCount');
      // build #2
      await pipeline.build();

      expect(stepA.buildCount).to.eql(2, 'stepA.buildCount');
      expect(stepB.buildCount).to.eql(1, 'stepB.buildCount');
      expect(stepC.buildCount).to.eql(1, 'stepC.buildCount');

      // build #3
      await expect(pipeline.build()).to.eventually.be.rejectedWith('Build Canceled');

      // build will cancel again during stepA (before the stepB) so
      // only stepA should have made progress
      expect(stepA.buildCount).to.eql(3, 'stepA.buildCount');
      expect(stepB.buildCount).to.eql(1, 'stepB.buildCount');
      expect(stepC.buildCount).to.eql(1, 'stepC.buildCount');
    });
  });

  describe('heimdall stats', function() {
    it('produces stats', async function() {
      const timeEqualAssert = function(a, b) {
        expect(a).to.be.a('number');

        // do not run timing assertions in Travis builds
        // the actual results of process.hrtime() are not
        // reliable
        if (process.env.CI !== 'true') {
          const delta = isWin ? 15e6 : 10e6;
          expect(a).to.be.within(b, b + delta);
        }
      };

      const timeTotalAssert = function(parentNode, childNodes) {
        expect(parentNode.stats.time.self).to.be.a('number');

        const childTime = childNodes.reduce(
          (accumulator, node) => accumulator + node.stats.time.total,
          0
        );

        expect(parentNode.stats.time.total).to.be.equal(childTime + parentNode.stats.time.self);
      };

      const veggies = new plugins.Veggies(['test/fixtures/basic'], {
        annotation: 'Eat your greens',
      });
      const sleep = new plugins.Sleeping(['test/fixtures/basic']);
      const sleep2 = new plugins.Sleeping(['test/fixtures/basic'], { sleep: 20 });
      const merge = new plugins.Merge([veggies, sleep, sleep2]);

      builder = new Builder(merge);
      await builder.build();
      const json = heimdall.toJSON();

      expect(json.nodes.length).to.equal(8);

      const rootNode = json.nodes[0];
      const mergeNode = json.nodes[1];
      const veggiesNode = json.nodes[2];
      const sourceNode = json.nodes[3];

      const sleepingNode = json.nodes[4];
      const sourceNode2 = json.nodes[5];

      const sleepingNode2 = json.nodes[6];
      const sourceNode3 = json.nodes[7];

      timeTotalAssert(rootNode, [mergeNode]);
      timeTotalAssert(mergeNode, [veggiesNode, sleepingNode, sleepingNode2]);
      timeTotalAssert(veggiesNode, [sourceNode]);
      timeTotalAssert(sleepingNode, [sourceNode2]);
      timeTotalAssert(sleepingNode2, [sourceNode3]);

      timeEqualAssert(sleepingNode.stats.time.self, 10e6);
      timeEqualAssert(sleepingNode2.stats.time.self, 20e6);

      // We can't use the actual times when doing a deep equal
      for (const node of json.nodes) {
        node.stats.time.self = 0;
        node.stats.time.total = 0;
      }

      expect(json).to.deep.equal({
        nodes: [
          {
            _id: 0,
            id: {
              name: 'heimdall',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [5],
          },
          {
            _id: 5,
            id: {
              name: 'MergePlugin',
              label: 'MergePlugin',
              broccoliNode: true,
              broccoliId: 4,
              broccoliCachedNode: false,
              broccoliPluginName: 'MergePlugin',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [2, 3, 4],
          },
          {
            _id: 2,
            id: {
              name: 'Eat your greens',
              label: 'VeggiesPlugin (Eat your greens)',
              broccoliNode: true,
              broccoliId: 1,
              broccoliCachedNode: false,
              broccoliPluginName: 'VeggiesPlugin',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [1],
          },
          {
            _id: 1,
            id: {
              name: path.resolve('test/fixtures/basic'),
              label: `WatchedDir (${path.resolve('test/fixtures/basic')}; string node)`,
              broccoliNode: true,
              broccoliId: 0,
              broccoliCachedNode: false,
              broccoliPluginName: 'WatchedDir',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [],
          },
          {
            _id: 3,
            id: {
              name: 'SleepingPlugin',
              label: 'SleepingPlugin',
              broccoliNode: true,
              broccoliId: 2,
              broccoliCachedNode: false,
              broccoliPluginName: 'SleepingPlugin',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [6],
          },
          {
            _id: 6,
            id: {
              name: path.resolve('test/fixtures/basic'),
              label: `WatchedDir (${path.resolve('test/fixtures/basic')}; string node)`,
              broccoliNode: true,
              broccoliId: 0,
              broccoliCachedNode: true,
              broccoliPluginName: 'WatchedDir',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [],
          },
          {
            _id: 4,
            id: {
              name: 'SleepingPlugin',
              label: 'SleepingPlugin',
              broccoliNode: true,
              broccoliId: 3,
              broccoliCachedNode: false,
              broccoliPluginName: 'SleepingPlugin',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [7],
          },
          {
            _id: 7,
            id: {
              name: path.resolve('test/fixtures/basic'),
              label: `WatchedDir (${path.resolve('test/fixtures/basic')}; string node)`,
              broccoliNode: true,
              broccoliId: 0,
              broccoliCachedNode: true,
              broccoliPluginName: 'WatchedDir',
            },
            stats: {
              own: {},
              time: {
                self: 0,
                total: 0,
              },
            },
            children: [],
          },
        ],
      });
    });
  });
});
