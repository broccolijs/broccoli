var stream = require('stream')
var test = require('tap').test
var fs = require('fs')
var through = require('through')
var concat = require('concat-stream')
var ab = require('../')

test('compiler', function (t) {
  // Virtual input tree containing one file.
  // This is baroque. Fold into processor?
  var inputTree = {
    readdir: function(path, callback) {
      //
    },

    readFile: function(path) {
      // To do: Make me relative to some base directory.
      return fs.createReadStream(path)
    }
  }

  function testCompiler(processor, inFilePath, vFileSequence) {
    // Should the inFilePath be a stream?
    var vFileStream = through().pause()
    vFileStream.write('// Compiled\n')
    processor.readFile(inFilePath).pipe(vFileStream)
    vFileSequence.emit('stream', vFileStream)
    vFileSequence.emit('end')
  }

  function testConcatenator(processor, vFileSequence) {
    var outStream = through().pause()
    outStream.write('// Concatenated\n')
    vFileSequence.on('stream', function(vFileStream) {
      vFileStream.pipe(outStream)
      vFileStream.resume()
    })
    vFileSequence.on('end', function() {
      outStream.emit('end')
    })
    return outStream
  }

  var processor = new ab.Processor(inputTree, testCompiler, testConcatenator)

  test('request', function(t) {
    t.plan(1)
    var outStream = processor.request('simpletree/test.js')
    outStream.pipe(concat(checkData))
    outStream.resume()
    function checkData(err, data) {
      t.equal(data.toString(), '// Concatenated\n// Compiled\n// This is the test.js file.\n')
    }
  })

  t.end()
})
