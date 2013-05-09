var stream = require('stream')
var CombinedStream = require('combined-stream');
var test = require('tap').test
var fs = require('fs')
var through = require('through')
var concat = require('concat-stream')
var ab = require('../')

test('compiler', function (t) {
  function testCompiler(processor, inFile, callback) {
    var vFileStream = through().pause()
    vFileStream.write(new Buffer('// Compiled\n'))
    inFile.stream.pipe(vFileStream)
    callback(null, [{stream: vFileStream}])
  }

  function testConcatenator(processor, vFiles, callback) {
    var outStream = CombinedStream.create()
    outStream.pause()
    outStream.append(new Buffer('// Concatenated\n'))
    vFiles.forEach(function(vFile) {
      outStream.append(vFile.stream)
    })
    callback(null, {stream: outStream})
  }

  var processor = new ab.Processor(testCompiler, testConcatenator)

  test('request', function(t) {
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

  t.end()
})
