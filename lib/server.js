var Watcher = require('./watcher')
var middleware = require('./middleware')
var http = require('http')
var connect = require('connect')

exports.serve = serve
function serve (builder, options) {
  options = options || {}

  console.log('Serving on http://' + options.host + ':' + options.port + '\n')

  var watcher = options.watcher || new Watcher(builder, {verbose: true})

  var app = connect().use(middleware(watcher))

  var server = http.createServer(app)

  // We register these so the 'exit' handler removing temp dirs is called
  function cleanupAndExit() {
    builder.cleanup().catch(function(err) {
      console.error('Cleanup error:')
      console.error(err && err.stack ? err.stack : err)
    }).finally(function() {
      process.exit(1)
    })
  }

  process.on('SIGINT', cleanupAndExit)
  process.on('SIGTERM', cleanupAndExit)

  watcher.on('change', function(results) {
    console.log('Built - ' + Math.round(results.totalTime / 1e6) + ' ms @ ' + new Date().toString())
  })

  watcher.on('error', function(err) {
    console.log('Built with error:')
    // Should also show file and line/col if present; see cli.js
    if (err.file) {
      console.log('File: ' + err.file)
    }
    console.log(err.stack)
    console.log('')
  })

  server.listen(parseInt(options.port, 10), options.host)
}
