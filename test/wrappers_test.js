import Node from '../lib/wrappers/node';
import TransformNode from '../lib/wrappers/transform-node';

const chai = require('chai');
const sinonChai = require('sinon-chai');
const sinon = require('sinon').createSandbox();
const { expect } = chai;

chai.use(sinonChai);

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
    delete process.env['BROCCOLI_ENABLED_MEMOIZE'];
  });

  it('shouldBuild should return false if there are no inputNodes and this is a rebuild', function() {
    process.env['BROCCOLI_ENABLED_MEMOIZE'] = true;

    transform._revision = 0;
    expect(transform.shouldBuild()).to.be.true;

    transform._revision = 1;
    expect(transform.shouldBuild()).to.be.false;
  });

  it('shouldBuild method should return false if none of the inputNodes changed', function() {
    process.env['BROCCOLI_ENABLED_MEMOIZE'] = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      expect(transform.shouldBuild()).to.be.false;
    });
  });

  it('shouldBuild method should return true if some of the inputs changed', function() {
    process.env['BROCCOLI_ENABLED_MEMOIZE'] = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    return transform.build().then(() => {
      inputWrapperA.revise();
      expect(transform.shouldBuild()).to.be.true;
    });
  });

  it('shouldBuild method should return true if none of the inputNodes changed and volatile is true', function() {
    transform.nodeInfo.volatile = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    expect(transform.shouldBuild()).to.be.true;
    inputWrapperA.revise();
    expect(transform.shouldBuild()).to.be.true;
  });

  it('build should receive object if trackInputChanges is true', async function() {
    const spy = sinon.spy();

    transform.nodeInfo.build = spy;
    transform.nodeInfo.trackInputChanges = true;

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    await transform.build();
    chai.expect(spy).to.have.been.calledWith({
      changedNodes: [true, true],
    });

    inputWrapperB.revise();

    await transform.build();
    chai.expect(spy).to.have.been.calledWith({
      changedNodes: [false, true],
    });

    inputWrapperA.revise();
    inputWrapperB.revise();

    await transform.build();
    chai.expect(spy).to.have.been.calledWith({
      changedNodes: [true, true],
    });

    await transform.build();

    chai.expect(spy).to.have.been.calledWith({
      changedNodes: [false, false],
    });
  });

  it('build should not receive an object if trackInputChanges is false / undefined', async function() {
    const spy = sinon.spy();

    transform.nodeInfo.build = spy;
    // transform.nodeInfo.trackInputChanges is undefined

    let inputWrapperA = new Node();
    let inputWrapperB = new Node();

    transform.inputNodeWrappers = [inputWrapperA, inputWrapperB];

    await transform.build();
    chai.expect(spy).to.have.been.calledWith();

    inputWrapperB.revise();

    await transform.build();
    chai.expect(spy).to.have.been.calledWith();

    transform.nodeInfo.trackInputChanges = false;

    await transform.build();
    chai.expect(spy).to.have.been.calledWith();

    inputWrapperB.revise();

    await transform.build();
    chai.expect(spy).to.have.been.calledWith();
  });
});
