var synchronized = require('synchronized')
var RSVP = require('rsvp')


exports.Builder = Builder
function Builder (tree) {
  this.tree = tree
  this.buildScheduled = false
  this.treesRead = []
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
          for (var i = 0; i < self.treesRead.length; i++) {
            if (self.treesRead[i].afterBuild != null) {
              self.treesRead[i].afterBuild()
            }
          }

          var newTreesRead = []

          function getReadTreeFn (tree) {
            function readTree (subtree) {
              // To do: Watching
              // To do: Avoid duplicate execution
              // To do: Complain about parallel execution
              // To do: Timing
              return RSVP.resolve()
                .then(function () {
                  if (newTreesRead.indexOf(subtree) === -1) {
                    newTreesRead.push(subtree)
                  }
                  return subtree.read(getReadTreeFn(subtree))
                })
            }
            return readTree
          }

          return getReadTreeFn(null)(self.tree)
            .finally(function () {
              self.treesRead = newTreesRead
            })
        })
        .finally(done)
        .then(resolve, reject)
    })
  })
}
