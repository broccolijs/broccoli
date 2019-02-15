'use strict';

const loadBrocfile = require('../lib/load_brocfile');
const chai = require('chai');

const projectPath = 'test/fixtures/project';
const brocfileFixture = require('../' + projectPath + '/Brocfile.js');
const brocfileFunctionFixture = require('../' + projectPath + '/Brocfile-Function.js');

describe('loadBrocfile', function() {
  let oldCwd = null;

  beforeEach(function() {
    oldCwd = process.cwd();
  });

  afterEach(function() {
    process.chdir(oldCwd);
  });

  context('without Brocfile.js', function() {
    beforeEach(function() {
      process.chdir('test/fixtures/basic');
    });

    it('return tree definition', function() {
      chai.expect(() => loadBrocfile()).to.throw(Error, 'Brocfile.js not found');
    });
  });

  context('with Brocfile.js', function() {
    beforeEach(function() {
      process.chdir(projectPath);
    });

    it('return tree definition', function() {
      const brocfile = loadBrocfile();
      chai.expect(brocfile).to.be.a('function')
      chai.expect(brocfile()).to.equal(brocfileFixture)
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
});
