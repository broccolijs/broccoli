var test = require('tap').test
var broccoli = require('..')
var Builder = broccoli.Builder
var RSVP = require('rsvp')
var Promise = RSVP.Promise

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
      t.equal(parentNode.deps.length, 1)
      var childNode = parentNode.subtrees[0]
      t.equal(childNode.directory, 'childTreeDir')
      t.equal(childNode.tree, child)
      timeEqual(childNode.totalTime, 20e6)
      timeEqual(childNode.selfTime, 20e6)
      t.equal(childNode.subtrees.length, 1)
      // string tree are not added as deps
      t.equal(childNode.deps.length, 0)
      var leafNode = childNode.subtrees[0]
      t.equal(leafNode.directory, 'srcDir')
      t.equal(leafNode.tree, 'srcDir')
      t.equal(leafNode.totalTime, 0)
      t.equal(leafNode.selfTime, 0)
      t.equal(leafNode.subtrees.length, 0)
      t.equal(leafNode.deps.length, 0)
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
  test('hasUnchangedDeps', function (t) {
    t.end()

    test('tree is not read when isUnchanged returns true', function (t) {

      var tree = new countingTree(function (readTree) { return 'foo' })

      var unchangedResult = true;
      tree.isUnchanged = function() {
        return unchangedResult;
      }

      var builder = new Builder(tree)
      builder.build().then(function (hash) {
        t.equal(tree.readCount, 1)

        unchangedResult = true;
        builder.build().then(function (hash) {
          t.equal(tree.readCount, 1)

          unchangedResult = false;
          builder.build().then(function (hash) {
            t.equal(tree.readCount, 2)
            t.end()
          })
        })
      })

    });

    test('tree isUnchanged result depends on its node dependencies', function (t) {
      // TODO: add test with multiple dependencies
      var tree = countingTree(function (readTree) {
        return readTree(child).then(function (dir) {
          return 'foo'
        })
      })
      tree.isUnchanged = function() {
        throw new Error('should never be thrown');
      }


      var child = new countingTree(function (readTree) { return 'foo' })
      var unchangedResult = true;
      child.isUnchanged = function() {
        return unchangedResult;
      }

      var builder = new Builder(tree)
      builder.build().then(function (hash) {
        t.equal(tree.readCount, 1)
        unchangedResult = true;
        builder.build().then(function (hash) {
          t.equal(tree.readCount, 1)

          unchangedResult = false;
          builder.build().then(function (hash) {
            t.equal(tree.readCount, 2)
            t.end()
          })
        })
      })

    });

  })


  t.end()
})
