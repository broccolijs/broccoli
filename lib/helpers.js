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
