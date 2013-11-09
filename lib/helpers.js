var walk = require('walk')

// Tree recursion helper to iterate over files with given extension
var walkFiles = exports.walkFiles = function (root, extension, fileCallback, endCallback) {
  var walker = walk.walk(root, {})

  walker.on('names', function (fileRoot, nodeNamesArray) {
    nodeNamesArray.sort()
  })

  function processFile (fileRoot, fileStats, next) {
    if (fileStats.name.slice(-(extension.length + 1)) === '.' + extension) {
      var fileInfo = getFileInfo(root, fileRoot, fileStats)
      fileCallback(fileInfo, fileStats, next)
    } else {
      next()
    }
  }

  walker.on('file', processFile)
  walker.on('symbolicLink', processFile) // TODO: check if target is a file

  walker.on('errors', function (fileRoot, nodeStatsArray, next) {
    // ERR
    console.error('Warning: unhandled error(s)', nodeStatsArray)
    next()
  })

  walker.on('end', function () {
    endCallback()
  })
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
