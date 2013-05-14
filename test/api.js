var stream = require('stream')
var CombinedStream = require('combined-stream');
var test = require('tap').test
var fs = require('fs')
var through = require('through')
var concat = require('concat-stream')
var broccoli = require('../')

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

  var processor = new broccoli.Processor(testCompiler, testConcatenator)

  processor.request('simpletree/test.js', function(err, outFile) {
    t.notOk(err)
    outFile.stream.pipe(concat(checkData))
    function checkData(err, data) {
      t.notOk(err)
      t.equal(data, '// Concatenated\n// Compiled\n// This is the test.js file.\n')
      t.end()
    }
  })
})

test('sourceUrlConcatenator', function (t) {
  var file1Stream = through().pause()
  file1Stream.write("console.log('Hello World.')")
  file1Stream.end()
  var file2Stream = through().pause()
  file2Stream.write("// File 2")
  file2Stream.end()
  var vFiles = [
    {
      stream: file1Stream,
      path: 'file1.js'
    },
    {
      stream: file2Stream,
      path: 'file2.js'
    }
  ]

  broccoli.sourceUrlConcatenator(null, vFiles, function(err, outFile) {
    t.notOk(err)
    outFile.stream.pipe(concat(function(err, data) {
      t.notOk(err)
      t.equal(data, "eval('console.log(\\'Hello World.\\')//@ sourceURL=file1.js')\neval('// File 2//@ sourceURL=file2.js')\n")
      t.end()
    }))
  })

  file1Stream.resume()
  file2Stream.resume()
})
