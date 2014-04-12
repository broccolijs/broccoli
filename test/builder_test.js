var test = require('tap').test
var broccoli = require('..')
var Builder = broccoli.Builder

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
  test('build', function (t) {
    test('returns string tree', function (t) {
      var builder = new Builder('someDir')
      builder.build().then(function (dir) {
        t.equal(dir, 'someDir')
        t.end()
      })
    })

    test('returns dir returned by object tree', function (t) {
      var builder = new Builder({
        read: function (readTree) { return 'someDir' }
      })
      builder.build().then(function (dir) {
        t.equal(dir, 'someDir')
        t.end()
      })
    })

    t.end()
  })

  test('readTree deduplicates', function (t) {
    var subtree = new countingTree(function (readTree) { return 'foo' })
    var builder = new Builder({
      read: function (readTree) {
        return readTree(subtree).then(function (dir) {
          return readTree(subtree) // read subtree again
        })
      }
    })
    builder.build().then(function (dir) {
      t.equal(dir, 'foo')
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
      builder.build().then(function (dir) {
        t.equal(dir, 'foo')
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

  t.end()
})
