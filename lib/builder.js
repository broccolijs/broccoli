var synchronized = require('synchronized')
var RSVP = require('rsvp')


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

  return new RSVP.Promise(function (resolve, reject) {
    synchronized(this, function (done) {
      self.buildScheduled = false

      RSVP.resolve()
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
                return RSVP.Promise.cast(subtree.read(getReadTreeFn(subtree)))
                  .then(function (dir) {
                    if (dir == null) throw new Error(subtree + ': .read must return a directory')
                    dirsCache[index] = dir
                    return dir
                  })
              } else {
                // Do not re-run .read; just return the cached directory path
                if (dirsCache[index] == null) throw new Error('Tree cycle detected')
                return RSVP.Promise.cast(dirsCache[index])
              }
            }
            return readTree
          }

          return getReadTreeFn(null)(self.tree)
            .finally(function () {
              self.treesRead = newTreesRead
              for (var i = 0; i < newTreesRead.length; i++) {
                if (self.allTreesRead.indexOf(newTreesRead[i]) === -1) {
                  self.allTreesRead.push(newTreesRead[i])
                }
              }
            })
        })
        .finally(done)
        .then(resolve, reject)
    })
  })
}

Builder.prototype.cleanup = function () {
  for (var i = 0; i < this.allTreesRead.length; i++) {
    if (this.allTreesRead[i].cleanup != null) {
      this.allTreesRead[i].cleanup()
    }
  }
}
