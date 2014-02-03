var path = require('path')
var rimraf = require('rimraf')
var mktemp = require('mktemp')

exports.TmpDirManager = TmpDirManager
function TmpDirManager (baseDir) {
  if (baseDir == null) {
    var temp = require('temp')
    temp.track()
    baseDir = temp.mkdirSync({
      prefix: '.broccoli-',
      suffix: '.tmp',
      dir: process.cwd()
    })
  }
  this._baseDir = baseDir
  this.tmpDirs = []
}

TmpDirManager.prototype.makeTmpDir = function (componentName) {
  var tmpDirName = (componentName ? componentName + '-' : '') + 'XXXXXXXX.tmp'
  var absolutePath = mktemp.createDirSync(path.join(this._baseDir, tmpDirName))
  this.tmpDirs.push(absolutePath)
  return absolutePath
}

TmpDirManager.prototype.cleanup = function () {
  for (var i = 0; i < this.tmpDirs.length; i++) {
    rimraf.sync(this.tmpDirs[i])
  }
  this.tmpDirs = []
}
