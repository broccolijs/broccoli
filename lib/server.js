var Watcher = require('./watcher')
var middleware = require('./middleware')
var http = require('http')
var tinylr = require('tiny-lr')
var connect = require('connect')

exports.watch = watch
exports.serve = serve

function initialize(builder, options) {
  this.options = options || {}
  this.watcher = new Watcher(builder)
  this.app = connect().use(middleware(this.watcher))
  this.server = http.createServer(this.app)

  console.log('Starting server on http://' + options.host + ':' + options.port + '\n')

  process.on('SIGINT', function () {
    process.exit(1)
  })
  process.on('SIGTERM', function () {
    process.exit(1)
  })
}

function watch(builder, options) {
  var that = this;
  initialize.call(this, builder, options)

  this.watcher.on('change', function(dir) {
    builder.copyTempFiles(dir, that.options.target, {overwrite: true})
    console.log('Built into ' + that.options.target)
  })

  this.watcher.on('error', function(err) {
    console.log('Built with error:')
    // Should also show file and line/col if present; see cli.js
    console.log(err.stack)
    console.log('')
  })

  this.server.listen(parseInt(this.options.port, 10), this.options.host)
}

function serve (builder, options) {
  initialize.call(this, builder, options)

  var livereloadServer = new tinylr.Server
  livereloadServer.listen(this.options.liveReloadPort, function (err) {
    if(err) {
      throw err
    }
  })

  var liveReload = function() {
    // We could pass files: glob.sync('**', {cwd: ...}), but this spams
    // stdout with messages and Chrome LiveReload doesn't seem to care
    // about the specific files.
    livereloadServer.changed({body: {files: ['LiveReload files']}})
  }

  this.watcher.on('change', function(dir) {
    console.log('Built')
    liveReload()
  })

  this.watcher.on('error', function(err) {
    console.log('Built with error:')
    // Should also show file and line/col if present; see cli.js
    console.log(err.stack)
    console.log('')
    liveReload()
  })

  this.server.listen(parseInt(this.options.port, 10), this.options.host)
}
