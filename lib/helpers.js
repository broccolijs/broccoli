var rimraf = require('rimraf')

var backgroundRimraf = exports.backgroundRimraf = function (dir, callback) {
  rimraf(dir, function (err) {
    if (err) {
      throw new Error('Failed to clean up ' + dir + ' - ' + err.toString())
    }
    if (callback) callback()
  })
}
