import loadBrocfile from '../lib/load_brocfile';
import BroccoliSource from 'broccoli-source';
import chai from 'chai';
import esm from 'esm';

const projectPath = 'test/fixtures/project';
const projectPathEsm = 'test/fixtures/project-esm';
const projectPathTs = 'test/fixtures/project-ts';
const projectPathTsConfig = 'test/fixtures/project-ts-tsconfig';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brocfileFixture = require('../' + projectPath + '/Brocfile.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const brocfileFunctionFixture = require('../' + projectPath + '/Brocfile-Function.js');
const brocfileEsmFixturePath = '../' + projectPathEsm + '/Brocfile.js';
let brocfileEsmFixture;
try {
  brocfileEsmFixture = require(brocfileEsmFixturePath);
} catch (err) {
  // Node error when requiring an ESM file from CJS on Node <= 20
  if (err && err.code === 'ERR_REQUIRE_ESM') {
    // esm is side-effectful so only load when needed
    const esmRequire = esm(module);
    // Load brocfile via esm shim
    brocfileEsmFixture = esmRequire(brocfileEsmFixturePath);
  }
  throw err;
}

describe('loadBrocfile', function() {
  let oldCwd = null;

  beforeEach(function() {
    oldCwd = process.cwd();

    // Ensure any previous .tsx? extensions are removed
    delete require.extensions['.ts']; // eslint-disable-line node/no-deprecated-api
    delete require.extensions['.tsx']; // eslint-disable-line node/no-deprecated-api
  });

  afterEach(function() {
    process.chdir(oldCwd);
  });

  context('without Brocfile.js', function() {
    beforeEach(function() {
      process.chdir('test/fixtures/basic');
    });

    it('return tree definition', function() {
      chai.expect(() => loadBrocfile()).to.throw(Error, 'Brocfile.[js|ts] not found');
    });
  });

  context('with Brocfile.js', function() {
    beforeEach(function() {
      process.chdir(projectPath);
    });

    it('return tree definition', function() {
      const brocfile = loadBrocfile();
      chai.expect(brocfile).to.be.a('function');
      chai.expect(brocfile()).to.equal(brocfileFixture);
    });
  });

  context('with invalid Brocfile.ts', function() {
    this.timeout(8000);

    it('throws an error for invalid syntax', function() {
      chai
        .expect(() => loadBrocfile({ brocfilePath: projectPathTs + '/Brocfile-invalid.ts' }))
        .to.throw(Error, /TS2322:.*Type '123' is not assignable to type 'String'/);
    });
  });

  context('with Brocfile.ts', function() {
    this.timeout(8000);

    it.skip('compiles and return tree definition', function() {
      process.chdir(projectPathTs);
      const brocfile = loadBrocfile();
      chai.expect(brocfile).to.be.a('function');
      chai.expect(brocfile()).to.be.an.instanceof(BroccoliSource.UnwatchedDir);
    });

    it.skip('uses the project tsconfig.json', function() {
      process.chdir(projectPathTsConfig);
      const brocfile = loadBrocfile();
      chai.expect(brocfile).to.be.a('function');
      chai.expect(brocfile({ env: 'subdir' })).to.equal(brocfileFixture);
    });
  });

  context('with Brocfile.js, called in subfolder', function() {
    beforeEach(function() {
      process.chdir(projectPath + '/subdir');
    });

    it('return tree definition', function() {
      chai.expect(loadBrocfile()()).to.equal(brocfileFixture);
    });
  });

  context('with path', function() {
    it('return tree definition', function() {
      chai
        .expect(loadBrocfile({ brocfilePath: projectPath + '/Brocfile.js' })())
        .to.equal(brocfileFixture);
    });

    it('throws error on invalid path', function() {
      const brocfilePath = projectPath + '/missing-brocfile.js';
      chai.expect(() => loadBrocfile({ brocfilePath })).to.throw(Error, /missing-brocfile.js/);
    });
  });

  context('with Brocfile that returns a function', function() {
    it('does not wrap the function', function() {
      const brocfile = loadBrocfile({ brocfilePath: projectPath + '/Brocfile-Function.js' });
      chai.expect(brocfile).to.equal(brocfileFunctionFixture);
      chai.expect(brocfile()).to.equal(brocfileFixture);
    });
  });

  context('with ESM Brocfile.js', function() {
    beforeEach(function() {
      process.chdir(projectPathEsm);
    });

    it('return tree definition', function() {
      chai.expect(loadBrocfile()).to.equal(brocfileEsmFixture.default);
      chai.expect(loadBrocfile()()).to.equal('subdir');
    });
  });
});
