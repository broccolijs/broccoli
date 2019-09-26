import Node from '../lib/wrappers/node';
import TransformNode from '../lib/wrappers/transform-node';
import OutputWrapper from '../lib/wrappers/output';

const chai = require('chai');
const sinonChai = require('sinon-chai');
const sinon = require('sinon').createSandbox();
const tmp = require('tmp');
const fs = require('fs');
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

  describe('fsFacade', function() {
    it('should respect the fsFacade flag set to false', function() {
      expect(transform.callbackObject.hasOwnProperty('input')).to.be.false;
    });

    it('should respect the fsFacade flag set to true', function() {
      transform.nodeInfo = {
        setup() {},
        fsFacade: true,
        getCallbackObject() {
          return this;
        },
        build() {},
      };
      transform.setup();
      expect(transform.callbackObject.hasOwnProperty('input')).to.be.true;
      expect(transform.callbackObject.hasOwnProperty('output')).to.be.true;
    });

    it('has fs operations as function in callbackObject', function() {
      transform.nodeInfo = {
        setup() {},
        fsFacade: true,
        getCallbackObject() {
          return this;
        },
        build() {},
      };
      transform.setup();
      expect(transform.callbackObject.input.F_OK).to.be.equal(fs.F_OK);
      expect(transform.callbackObject.output.F_OK).to.be.equal(fs.F_OK);
      expect(typeof transform.callbackObject.input.readFileSync).to.be.equal('function');
      expect(typeof transform.callbackObject.output.writeFileSync).to.be.equal('function');
    });
  });
});

describe('output-wrapper', function() {
  let output, temp;

  beforeEach(() => {
    temp = tmp.dirSync();
    let node = {
      outputPath: temp.name,
    };
    output = new OutputWrapper(node).fs;
  });

  it('should write to given location', function() {
    output.writeFileSync('test.md', 'test');
    let content = fs.readFileSync(`${temp.name}/test.md`, 'UTF-8');
    expect(content).to.be.equal('test');
  });

  it(`accepts absolute path as well`, function() {
    output.writeFileSync(`${temp.name}/test.md`, 'test');
    let content = fs.readFileSync(`${temp.name}/test.md`, 'UTF-8');
    expect(content).to.be.equal('test');
  });

  it(`should allow other fs operations too`, function() {
    output.writeFileSync('test.md', 'test');
    let content = output.fs.existsSync('test.md');
    expect(content, 'existsSync should work').to.be.true;
    content = output.fs.readFileSync('test.md', 'utf-8');
    expect(content, 'readFileSync should work').to.be.equal('test');
  });

  it(`should not throw if the dir strutcture doesn't exist and attempt to write`, function() {
    output.writeFileSync('test/test.md', 'test');
    let content = fs.readFileSync(`${temp.name}/test/test.md`, 'UTF-8');
    expect(content).to.be.equal('test');
  });

  it(`should throw if the dir strutcture doesn't exist and attempt to read`, function() {
    expect(() => output.readFileSync('test/test.md')).to.throw(
      /ENOENT: no such file or directory,/
    );
  });

  it(`should return _root value`, function() {
    expect(output._root).to.be.equal(temp.name);
  });
});
