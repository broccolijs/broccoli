var jshashes = require('jshashes')

exports.statsHash = statsHash
function statsHash (key, path, stats) {
  var keys = [
    key,
    path,
    stats.dev,
    stats.ino,
    stats.mode,
    // not stats.nlink
    stats.uid,
    stats.gid,
    stats.rdev,
    stats.size,
    stats.blksize,
    stats.blocks,
    // not stats.atime
    stats.mtime.getTime(),
    stats.ctime.getTime()
  ]
  var joinedKeys = keys.join('\n')
  var hash = new jshashes.SHA256().hex(joinedKeys)
  return hash
}
