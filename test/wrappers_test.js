'use strict';

const expect = require('chai').expect;
const Node = require('../lib/wrappers/node');
const TransformNode = require('../lib/wrappers/transform-node');

describe('transform-node', function() {
  let transform;

  beforeEach(() => {
    transform = new TransformNode();
    transform.nodeInfo = {
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

  it('shouldBuild method should return false there are no input nodes and this is a rebuild', function() {
    process.env['BROCCOLI_VOLATILE'] = true;
    transform._revision = 1;

    expect(transform.shouldBuild()).to.be.false;
  });

  it('shouldBuild method should return false if none of the inputs changed', function() {
    process.env['BROCCOLI_VOLATILE'] = true;
    transform.nodeInfo.persistentOutput = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      expect(transform.shouldBuild()).to.be.false;
    });
  });

  it('shouldBuild method should return true if some of the inputs changed', function() {
    process.env['BROCCOLI_VOLATILE'] = true;

    transform.nodeInfo.persistentOutput = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      inputWrapperA.revise();
      expect(transform.shouldBuild()).to.be.true;
    });
  });
});
