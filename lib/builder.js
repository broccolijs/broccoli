var Promise = require('rsvp').Promise


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.buildScheduled = false
  this.treesRead = [] // last build
  this.allTreesRead = [] // across all builds
  process.addListener('exit', this.cleanup.bind(this))
}

Builder.prototype.build = function () {
  var self = this
  if (this.buildScheduled) return // debounce
  this.buildScheduled = true

  return new Promise(function (resolve, reject) {
    self.buildScheduled = false

    Promise.resolve()
      .then(function () {
        var newTreesRead = []
        var dirsCache = []

        function getReadTreeFn (tree) {
          function readTree (subtree) {
            // To do: Complain about parallel execution
            // To do: Timing
            var index = newTreesRead.indexOf(subtree)
            if (index === -1) {
              newTreesRead.push(subtree)
              dirsCache.push(null)
              index = dirsCache.length - 1
              return Promise.resolve(subtree.read(getReadTreeFn(subtree)))
                .then(function (dir) {
                  if (dir == null) throw new Error(subtree + ': .read must return a directory')
                  dirsCache[index] = dir
                  return dir
                })
            } else {
              // Do not re-run .read; just return the cached directory path
              if (dirsCache[index] == null) throw new Error('Tree cycle detected')
              return Promise.resolve(dirsCache[index])
            }
          }
          return readTree
        }

        return getReadTreeFn(null)(self.tree)
          .then(function (dir) {
            self.treesRead = newTreesRead
            return dir
          }, function (err) {
            // self.treesRead is used by the watcher. Do not stop watching
            // directories if we crash in the middle, or we get double builds.
            if (newTreesRead.length > self.treesRead.length) {
              self.treesRead = newTreesRead
            }
            throw err
          })
          .finally(function () {
            for (var i = 0; i < newTreesRead.length; i++) {
              if (self.allTreesRead.indexOf(newTreesRead[i]) === -1) {
                self.allTreesRead.push(newTreesRead[i])
              }
            }
          })
      })
      .catch(function (err) {
        if (typeof err === 'string') {
          err = new Error(err + ' [string exception]')
        }
        throw err
      })
      .then(resolve, reject)
  })
}

Builder.prototype.cleanup = function () {
  for (var i = 0; i < this.allTreesRead.length; i++) {
    this.allTreesRead[i].cleanup()
  }
}
