'use strict';

const broccoli = require('../lib/index');
const chai = require('chai');
const sinon = require('sinon').createSandbox();
const sinonChai = require('sinon-chai');
const cli = require('../lib/cli');

chai.use(sinonChai);

describe('cli', function() {
  let mock = null;
  let oldCwd = null;

  beforeEach(function() {
    oldCwd = process.cwd();
    process.chdir('test/fixtures/project/subdir');
    mock = sinon.mock(broccoli.server);
  });

  afterEach(function() {
    sinon.restore();
    process.chdir(oldCwd);
  });

  it('should start a server with default values', function() {
    mock
      .expects('serve')
      .once()
      .withArgs(sinon.match.any, sinon.match.string, sinon.match.number);
    cli(['node', 'broccoli', 'serve']);
    mock.verify();
  });

  it('starts server with given ip adress', function() {
    mock.expects('serve').withArgs(sinon.match.any, '192.168.2.123', sinon.match.number);
    cli(['node', 'broccoli', 'serve', '--host', '192.168.2.123']);
    mock.verify();
  });

  it('converts port to a number and starts the server at given port', function() {
    mock
      .expects('serve')
      .once()
      .withArgs(sinon.match.any, sinon.match.string, 1234);
    cli(['node', 'broccoli', 'serve', '--port', '1234']);
    mock.verify();
  });

  it('converts port to a number and starts the server at given port and host', function() {
    mock
      .expects('serve')
      .once()
      .withArgs(sinon.match.any, '192.168.2.123', 1234);
    cli(['node', 'broccoli', 'serve', '--port=1234', '--host=192.168.2.123']);
    mock.verify();
  });
});