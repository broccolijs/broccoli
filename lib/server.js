var Watcher = require('./watcher')
var middleware = require('./middleware')
var http = require('http')
var tinylr = require('tiny-lr')
var connect = require('connect')

exports.serve = serve
function serve (options) {
  options = options || {}

  console.log('Serving on http://' + options.host + ':' + options.port + '\n')

  var watcher = options.watcher || new Watcher()

  var app = connect().use(middleware(watcher))

  var server = http.createServer(app)

  var livereloadServer = new tinylr.Server
  livereloadServer.listen(options.liveReloadPort, function (err) {
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

  watcher.on('change', function(dir) {
    console.log('Built - ' + watcher.builder.buildTime)
    liveReload()
  })

  watcher.on('error', function(err) {
    console.log('Built with error:')
    // Should also show file and line/col if present; see cli.js
    if (err.file) {
      console.log('File: ' + err.file)
    }
    console.log(err.stack)
    console.log('')
    liveReload()
  })

  server.listen(parseInt(options.port, 10), options.host)
}
