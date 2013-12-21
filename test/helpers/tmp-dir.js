var path = require('path')
var temp = require('temp')
var findup = require('findup-sync')
var mkdirp = require('mkdirp')

temp.track()

var baseDir = path.dirname(findup('package.json'))
var testTmpDir = path.join(baseDir, 'test', 'tmp')
mkdirp.sync(testTmpDir)
var tmpDir = temp.mkdirSync({
  dir: testTmpDir,
  prefix: 'test-run-'
})

module.exports = tmpDir
