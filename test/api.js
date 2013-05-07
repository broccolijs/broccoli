var stream = require('stream');
var test = require('tap').test;
var fs = require('fs');
var pipette = require('pipette');
var ab = require('../');

test('compiler', function (t) {
  // Virtual input tree containing one file.
  var inputTree = {
    readdir: function(path, callback) {
      t.ok(path === '//app');
      callback(null, ['test.js']);
    },

    readFile: function(path, callback) {
      t.ok(path === '//app/test.js');
      var fileStream = new pipette.Blip('// This is the test.js file.');
      callback(null, fileStream);
      // This requires stuff to be sync.
      // https://github.com/Obvious/pipette/issues/34
      fileStream.resume()
    }
  };

  var processor = new ab.Processor(inputTree);

  test('request', function(t) {
    t.plan(1);
    processor.request('//app/test.js', function(err, outStream) {
      outStream.on('data', function(data) {
        t.equal(data.toString(), '// This is the test.js file.');
      });
    });
  })

  t.end();
});
