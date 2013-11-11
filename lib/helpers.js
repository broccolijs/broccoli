var rimraf = require('rimraf')

var backgroundRimraf = exports.backgroundRimraf = function (dir) {
  rimraf(dir, function (err) {
    if (err) {
      throw new Error('Failed to clean up ' + dir + ' - ' + err.toString())
    }
  })
}

var unexpectedWalkError = exports.unexpectedWalkError = function (fileRoot, nodeStatsArray, next) {
  throw new Error('Unexpected error traversing directory at or below ' + fileRoot)
}

var getFileInfo = exports.getFileInfo = function (root, fileRoot, fileStats) {
  var fileInfo = {}
  fileInfo.baseName = fileStats.name
  fileInfo.fullPath = fileRoot + '/' + fileStats.name
  fileInfo.relativePath = fileInfo.fullPath.slice(root.length + 1)
  var match = /.\.([^./]+)$/.exec(fileStats.name)
  if (match) {
    fileInfo.extension = match[1]
    // Note: moduleName is also used to construct new file paths; maybe it
    // shouldn't
    fileInfo.moduleName = fileInfo.relativePath.slice(0, -(fileInfo.extension.length + 1))
  } else {
    fileInfo.moduleName = fileInfo.relativePath
  }
  return fileInfo
}
