'use strict';

const broccoli = require('../lib/index');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

describe('cli', function() {
  let mock = null;
  let oldCwd = null;
  let cli;
  beforeEach(function() {
    oldCwd = process.cwd();
    process.chdir('test/fixtures/project/subdir');
    cli = require('../lib/cli');
    mock = sinon.mock(broccoli.server);
  });

  afterEach(function() {
    process.chdir(oldCwd);
    mock.restore();
    delete require.cache[require.resolve('commander')];
    delete require.cache[require.resolve('../lib/cli')];
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
