'use strict';

const expect = require('chai').expect;
const Node = require('../lib/wrappers/node');
const TransformNode = require('../lib/wrappers/transform-node');

describe('transform-node', function() {
  let transform;

  beforeEach(() => {
    transform = new TransformNode();
    transform.nodeInfo = {
      persistentOutput: true,
      setup() {},
      getCallbackObject() {
        return this;
      },
      build() {},
    };
    transform.setup();
    transform.inputNodeWrappers = [];
  });

  afterEach(() => {
    delete process.env['BROCCOLI_VOLATILE'];
  });

  it('memoizationEnabled method should return the correct value', function() {
    process.env['BROCCOLI_VOLATILE'] = true;
    expect(transform.memoizationEnabled(false)).to.be.true;

    process.env['BROCCOLI_VOLATILE'] = false;
    expect(transform.memoizationEnabled(true)).to.be.true;

    process.env['BROCCOLI_VOLATILE'] = true;
    expect(transform.memoizationEnabled()).to.be.true;

    process.env['BROCCOLI_VOLATILE'] = false;
    expect(transform.memoizationEnabled(false)).to.be.false;

    delete process.env['BROCCOLI_VOLATILE'];
    expect(transform.memoizationEnabled(false)).to.be.false;

    delete process.env['BROCCOLI_VOLATILE'];
    expect(transform.memoizationEnabled()).to.be.false;
  });

  it('shouldBuild method should return false there are no input nodes and this is a rebuild', function() {
    process.env['BROCCOLI_VOLATILE'] = true;

    transform._revision = 0;
    expect(transform.shouldBuild()).to.be.true;

    transform._revision = 1;
    expect(transform.shouldBuild()).to.be.false;
  });

  it('shouldBuild method should return false if none of the inputs changed', function() {
    process.env['BROCCOLI_VOLATILE'] = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      expect(transform.shouldBuild()).to.be.false;
    });
  });

  it('shouldBuild method should return true if some of the inputs changed', function() {
    process.env['BROCCOLI_VOLATILE'] = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      inputWrapperA.revise();
      expect(transform.shouldBuild()).to.be.true;
    });
  });

  it('if volatile is set to true then do not call revise', function() {
    transform.nodeInfo.volatile = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    inputWrapperA.revise();
    expect(transform.revision).to.equal(0);

    return transform.build().then(() => {
      expect(transform.revision).to.equal(0);
    });
  });

  it('if volatile is not set (or false) then revise is automatically called', function() {
    transform.nodeInfo.volatile = false;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    inputWrapperA.revise();
    expect(transform.revision).to.equal(0);

    return transform.build().then(() => {
      expect(transform.revision).to.equal(1);
    });
  });
});
