var test = require('tap').test
var broccoli = require('..')
var Builder = broccoli.Builder
var RSVP = require('rsvp')
var Promise = RSVP.Promise
var Middleware = require('../lib/middleware')
var fs = require('fs')
var mime = require('mime')

RSVP.on('error', function(error) {
  throw error
})

function countingTree (readFn) {
  return {
    read: function (readTree) {
      this.readCount++
      return readFn.call(this, readTree)
    },
    readCount: 0,
    cleanup: function () { this.cleanupCount++ },
    cleanupCount: 0
  }
}

// middleware needs to stat a file to continue to deliver a resource
function addTestFile(name, contents) {
  fs.writeFileSync(__dirname + '/' + name, contents || 'bar')
}
function removeTestFile(name) {
  fs.unlinkSync(__dirname + '/' + name)
}

test('Builder', function (t) {
  test('core functionality', function (t) {
    t.end()

    test('build', function (t) {
      test('passes through string tree', function (t) {
        var builder = new Builder('someDir')
        builder.build().then(function (hash) {
          t.equal(hash.directory, 'someDir')
          t.end()
        })
      })

      test('calls read on the given tree object', function (t) {
        var builder = new Builder({
          read: function (readTree) { return 'someDir' }
        })
        builder.build().then(function (hash) {
          t.equal(hash.directory, 'someDir')
          t.end()
        })
      })

      t.end()
    })

    test('readTree deduplicates', function (t) {
      var subtree = new countingTree(function (readTree) { return 'foo' })
      var builder = new Builder({
        read: function (readTree) {
          return readTree(subtree).then(function (hash) {
            var dirPromise = readTree(subtree) // read subtree again
            t.ok(dirPromise.then, 'is promise, not string')
            return dirPromise
          })
        }
      })
      builder.build().then(function (hash) {
        t.equal(hash.directory, 'foo')
        t.equal(subtree.readCount, 1)
        t.end()
      })
    })

    test('cleanup', function (t) {
      test('is called on all trees called ever', function (t) {
        var tree = countingTree(function (readTree) {
          // Interesting edge case: Read subtree1 on the first read, subtree2 on
          // the second
          return readTree(this.readCount === 1 ? subtree1 : subtree2)
        })
        var subtree1 = countingTree(function (readTree) { return 'foo' })
        var subtree2 = countingTree(function (readTree) { throw new Error('bar') })
        var builder = new Builder(tree)
        builder.build().then(function (hash) {
          t.equal(hash.directory, 'foo')
          builder.build().catch(function (err) {
            t.equal(err.message, 'bar')
            builder.cleanup()
            t.equal(tree.cleanupCount, 1)
            t.equal(subtree1.cleanupCount, 1)
            t.equal(subtree2.cleanupCount, 1)
            t.end()
          })
        })
      })

      t.end()
    })
  })

  test('tree graph', function (t) {
    var parent = countingTree(function (readTree) {
      return readTree(child).then(function (dir) {
        return new Promise(function (resolve, reject) {
          setTimeout(function() { resolve('parentTreeDir') }, 30)
        })
      })
    })

    var child = countingTree(function (readTree) {
      return readTree('srcDir').then(function (dir) {
        return new Promise(function (resolve, reject) {
          setTimeout(function() { resolve('childTreeDir') }, 20)
        })
      })
    })

    var timeEqual = function (a, b) {
      t.equal(typeof a, 'number')

      // do not run timing assertions in Travis builds
      // the actual results of process.hrtime() are not
      // reliable
      if (process.env.CI !== 'true') {
        t.ok(a >= b - 5e6 && a <= b + 5e6, 'Wanted ' + b + ' +/- 5e6, found ' + a)
      }
    }

    var builder = new Builder(parent)
    builder.build().then(function (hash) {
      t.equal(hash.directory, 'parentTreeDir')
      var parentNode = hash.graph
      t.equal(parentNode.directory, 'parentTreeDir')
      t.equal(parentNode.tree, parent)
      timeEqual(parentNode.totalTime, 50e6)
      timeEqual(parentNode.selfTime, 30e6)
      t.equal(parentNode.subtrees.length, 1)
      var childNode = parentNode.subtrees[0]
      t.equal(childNode.directory, 'childTreeDir')
      t.equal(childNode.tree, child)
      timeEqual(childNode.totalTime, 20e6)
      timeEqual(childNode.selfTime, 20e6)
      t.equal(childNode.subtrees.length, 1)
      var leafNode = childNode.subtrees[0]
      t.equal(leafNode.directory, 'srcDir')
      t.equal(leafNode.tree, 'srcDir')
      t.equal(leafNode.totalTime, 0)
      t.equal(leafNode.selfTime, 0)
      t.equal(leafNode.subtrees.length, 0)
      t.end()
    })
  })

  test('string tree callback', function (t) {
    var builder = new Builder('fooDir')
    builder.build(function willReadStringTree (dir) {
      t.equal(dir, 'fooDir')
      t.end()
    })
  })

  t.end()
})

test('Middleware', function (t) {

  var filename = 'foo'
  var request = {
    headers: {},
    url: filename
  }
  var response = {
    headers: {},
    setHeader: function(key, value) {
      this.headers[key] = value
    },
    writeHead: function(code) {
      this.code = code
    },
    end: function() {}
  }
  var watcher = new Promise(function(resolve, reject){
    resolve({directory: __dirname + '/'})
  })

  test('sets default headers', function (t) {
    var middleware = new Middleware(watcher)

    addTestFile(filename)
    middleware(request, response)
    watcher.then(function() {
      t.equal(response.code, 200)

      t.equal(response.headers['Last-Modified'], fs.statSync(filename).mtime.toUTCString())
      t.equal(response.headers['Cache-Control'], 'private, max-age=0, must-revalidate')
      t.equal(response.headers['Content-Length'], fs.statSync(filename).size)
      t.equal(response.headers['Content-Type'], mime.lookup(filename))

      // CORS unset by default
      t.equal(response.headers['Access-Control-Allow-Origin'], undefined)
      t.equal(response.headers['Access-Control-Allow-Methods'], undefined)
      t.equal(response.headers['Access-Control-Request-Method'], undefined)
      t.equal(response.headers['Access-Control-Allow-Headers'], undefined)

      removeTestFile(filename)
      t.end()
    })
  })

  test('sets optional CORS headers', function (t) {
    var middleware = new Middleware(watcher, { cors: true })

    addTestFile(filename)
    middleware(request, response)
    watcher.then(function() {
      t.equal(response.headers['Access-Control-Allow-Origin'], '*')
      t.equal(response.headers['Access-Control-Allow-Methods'], 'GET')
      t.equal(response.headers['Access-Control-Request-Method'], '*')
      t.equal(response.headers['Access-Control-Allow-Headers'], 'Origin, X-Requested-With, Content-Type, Accept, Authorization')

      removeTestFile(filename)
      t.end()
    })
  })

  t.end()
})
