var jshashes = require('jshashes')

exports.statsHash = statsHash
function statsHash (key, path, stats) {
  var keys = [
    key,
    path,
    stats.mode,
    stats.size,
    stats.mtime.getTime()
  ]
  var joinedKeys = keys.join('\n')
  var hash = new jshashes.SHA256().hex(joinedKeys)
  return hash
}
