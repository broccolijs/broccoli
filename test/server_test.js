'use strict'

var server = require('../lib/server')
var Watcher = require('../lib/watcher')
var expect = require('chai').expect

describe('server', function() {
    it('throws if first argument is not an instance of Watcher', function() {
        expect(function() {
            server.serve({}, 123, 1234)
        }).to.throw(/Watcher/)
    })
    it('throws if host is not a string', function() {
        expect(function() {
            server.serve(new Watcher(), 123, 1234)
        }).to.throw(/host/)
    })
    it('throws if port is not a number', function() {
        expect(function() {
            server.serve(new Watcher(), '0.0.0.0', '1234')
        }).to.throw(/port/)
    })
    it('throws if port is NaN', function() {
        expect(function() {
            server.serve(new Watcher(), '0.0.0.0', parseInt('port'))
        }).to.throw(/port/)
    })
})