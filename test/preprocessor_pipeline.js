var fs = require('fs')
var test = require('tap').test
var temp = require('temp'); temp.track()
var broccoli = require('../')
var testHelpers = require('./test_helpers')

var PreprocessorPipeline = broccoli.PreprocessorPipeline
var Preprocessor = broccoli.Preprocessor

test('PreprocessorPipeline', function (t) {
  function transform (pipeline, srcDir, callback) {
    var destDir = temp.mkdirSync({ prefix: 'preprocessor-pipeline-dest-', suffix: '.tmp', dir: '.' })
    pipeline.transform(srcDir, destDir, function (err) {
      if (err) throw err
      callback(destDir)
    })
  }

  // This preprocessor adds ' [name]' to file contents
  TestPreprocessor.prototype = Object.create(Preprocessor.prototype)
  TestPreprocessor.prototype.constructor = TestPreprocessor
  function TestPreprocessor (options) {
    this.name = options.name
    this.extensions = options.extensions
    this.targetExtension = options.targetExtension
    this.callCount = 0
  }

  TestPreprocessor.prototype.processContents = function (contents, callback) {
    this.callCount += 1
    callback(null, contents + ' [' + this.name + ']')
  }

  test('processes depending on extension', function (t) {
    var jsPreprocessor = new TestPreprocessor({
      name: 'es6.js',
      extensions: ['es6.js'],
      targetExtension: null
    })
    var aPreprocessor = new TestPreprocessor({
      name: 'a',
      extensions: ['a'],
      targetExtension: 'b'
    })
    var bPreprocessor = new TestPreprocessor({
      name: 'b',
      extensions: ['b'],
      targetExtension: 'c'
    })

    var pipeline = testHelpers.setupComponent(new PreprocessorPipeline)
      .addPreprocessor(aPreprocessor)
      .addPreprocessor(bPreprocessor)
      .addPreprocessor(jsPreprocessor)

    var srcDir = testHelpers.makeTree({
      'x/y.es6.js': 'y.es6.js contents',
      'x/y.a': 'y.a contents',
      'x/y.foo': 'y.foo contents'
    })

    transform(pipeline, srcDir, function (destDir) {
      var files = fs.readdirSync(destDir + '/x')
      files.sort()
      t.deepEqual(files, ['y.c', 'y.es6.js', 'y.foo'])

      t.equal(
        fs.readFileSync(destDir + '/x/y.es6.js').toString(),
        'y.es6.js contents [es6.js]',
        'preprocessor is applied')
      t.equal(
        fs.readFileSync(destDir + '/x/y.c').toString(),
        'y.a contents [a] [b]',
        'multiple preprocessors are applied')
      t.equal(
        fs.readFileSync(destDir + '/x/y.foo').toString(),
        'y.foo contents',
        'unmatched files are passed through')
      t.equal(aPreprocessor.callCount, 1)
      t.equal(bPreprocessor.callCount, 1)
      t.equal(jsPreprocessor.callCount, 1)

      test('files are cached', function (t) {
        transform(pipeline, srcDir, function (destDir) {
          // counts are still 1
          t.equal(aPreprocessor.callCount, 1)
          t.equal(bPreprocessor.callCount, 1)
          t.equal(jsPreprocessor.callCount, 1)
          t.end()
        })
      })

      t.end()
    })
  })

  test('getDestFileName API', function (t) {
    var preprocessor = new TestPreprocessor({ name: 'test' })
    preprocessor.getDestFileName = function (relativePath) {
      if (relativePath === 'x') {
        return 'y'
      }
      return null
    }
    var pipeline = testHelpers.setupComponent(new PreprocessorPipeline)
      .addPreprocessor(preprocessor)
    var srcDir = testHelpers.makeTree({
      'dir/x': 'x contents',
      'dir/z': 'z contents'
    })
    transform(pipeline, srcDir, function (destDir) {
      t.equal(fs.readFileSync(destDir + '/dir/y').toString(), 'x contents [test]')
      t.equal(fs.readFileSync(destDir + '/dir/z').toString(), 'z contents')
      t.end()
    })
  })

  t.end()
})
