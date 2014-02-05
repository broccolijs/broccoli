var synchronized = require('synchronized')
var RSVP = require('rsvp')


exports.Builder = Builder
function Builder (tree) {
  this.baseDir = '.' // should perhaps not rely on cwd
  this.tree = tree

  this.buildScheduled = false
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
          // To do: This also needs to run when the process exits
          if (self._previousTrees != null) {
            for (var i = 0; i < self._previousTrees.length; i++) {
              if (self._previousTrees[i].afterBuild != null) {
                self._previousTrees[i].afterBuild()
              }
            }
          }

          var trees = []

          function getReadTreeFn (tree) {
            function readTree (subtree) {
              // To do: Watching
              // To do: Avoid duplicate execution
              // To do: Complain about parallel execution
              // To do: Timing
              return RSVP.resolve()
                .then(function () {
                  if (trees.indexOf(subtree) === -1) {
                    trees.push(subtree)
                  }
                  return subtree.read(getReadTreeFn(subtree))
                })
            }
            return readTree
          }

          return getReadTreeFn(null)(self.tree)
            .then(function (dir) {
              self._previousTrees = trees
              return dir
            })
        })
        .finally(done)
        .then(resolve, reject)
    })
  })
}
