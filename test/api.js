var stream = require('stream')
var CombinedStream = require('combined-stream');
var test = require('tap').test
var fs = require('fs')
var through = require('through')
var concat = require('concat-stream')
var ab = require('../')

test('request', function (t) {
  function testCompiler(processor, inFilePath, callback) {
    var inFileStream = processor.inFileStream(inFilePath)
    var vFileStream = through().pause()
    vFileStream.write('// Compiled\n')
    inFileStream.pipe(vFileStream)
    callback(null, [{stream: vFileStream, path: inFilePath}])
    vFileStream.resume()
  }

  function testConcatenator(processor, vFiles, callback) {
    var outStream = CombinedStream.create()
    outStream.pause()
    outStream.append('// Concatenated\n')
    vFiles.forEach(function(vFile) {
      outStream.append(vFile.stream)
    })
    callback(null, {stream: outStream})
    outStream.resume()
  }

  var processor = new ab.Processor(testCompiler, testConcatenator)

  processor.request('simpletree/test.js', function(err, outFile) {
    t.notOk(err)
    outFile.stream.pipe(concat(checkData))
    function checkData(err, data) {
      t.notOk(err)
      t.equal(data.toString(), '// Concatenated\n// Compiled\n// This is the test.js file.\n')
      t.end()
    }
  })
})
