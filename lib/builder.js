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
          var readTree = function (tree) {
            return RSVP.resolve()
              .then(function () {
                return tree.read(readTree)
              })
          }
          return readTree(self.tree)
        })
        .finally(done)
        .then(resolve, reject)
    })
  })
}
