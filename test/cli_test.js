'use strict'

var cli = require('../lib/cli')
var broccoli = require('../lib/index')
var chai = require('chai')
var sinon = require('sinon')
var sinonChai = require('sinon-chai')
chai.use(sinonChai)

describe('cli', function() {
    var mock = null
    beforeEach(function() {
        cli = require('../lib/cli')
        mock = sinon.mock(broccoli.server)
        sinon.stub(broccoli, 'loadBrocfile', function() {
            return new broccoli.Builder('test/fixtures')
        })
        sinon.stub(broccoli, 'Builder', function() {
            return { watchedPaths: [], build: function() { return new global.Promise(function() {}) }, cleanup: function() {} }
        })
    })

    afterEach(function() {
        mock.restore()
        broccoli.loadBrocfile.restore()
        broccoli.Builder.restore()
        delete require.cache[require.resolve('commander')]
        delete require.cache[require.resolve('../lib/cli')]
    })

    it('should start a server with default values', function() {
        mock.expects('serve').once().withArgs(sinon.match.any, sinon.match.string, sinon.match.number)
        cli(['node', 'broccoli', 'serve'])
        mock.verify()
    })

    it('starts server with given ip adress', function() {
        mock.expects('serve').withArgs(sinon.match.any, '192.168.2.123', sinon.match.number)
        cli(['node', 'broccoli', 'serve', '--host', '192.168.2.123'])
        mock.verify()
    })

    it('converts port to a number and starts the server at given port', function() {
        mock.expects('serve').once().withArgs(sinon.match.any, sinon.match.string, 1234)
        cli(['node', 'broccoli', 'serve', '--port', '1234'])
        mock.verify()
    })

    it('converts port to a number and starts the server at given port and host', function() {
        mock.expects('serve').once().withArgs(sinon.match.any, '192.168.2.123', 1234)
        cli(['node', 'broccoli', 'serve', '--port=1234', '--host=192.168.2.123'])
        mock.verify()
    })
})