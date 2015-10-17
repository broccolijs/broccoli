var Watcher = require('./watcher')
var middleware = require('./middleware')
var http = require('http')
var connect = require('connect')
var printSlowNodes = require('broccoli-slow-trees')

exports.serve = serve
function serve (builder, options) {
  options = options || {}
  var server = {}

  console.log('Serving on http://' + options.host + ':' + options.port + '\n')

  server.watcher = options.watcher || new Watcher(builder, {verbose: true})

  server.app = connect().use(middleware(server.watcher))

  server.http = http.createServer(server.app)

  // We register these so the 'exit' handler removing temp dirs is called
  function cleanupAndExit() {
    return server.watcher.quit()
      .then(function() {
        builder.cleanup()
      })
      .catch(function(err) {
        console.error('Cleanup error:')
        console.error(err && err.stack ? err.stack : err)
      }).finally(function() {
        process.exit(1)
      })
  }

  process.on('SIGINT', cleanupAndExit)
  process.on('SIGTERM', cleanupAndExit)

  server.watcher.on('change', function() {
    printSlowNodes(builder.outputNodeWrapper)
    console.log('Built - ' + Math.round(builder.outputNodeWrapper.buildState.totalTime) + ' ms @ ' + new Date().toString())
  })

  server.watcher.on('error', function(err) {
    console.log('Built with error:')
    console.error(err.message)
    if (!err.broccoliPayload || !err.broccoliPayload.location.file) {
      console.log('')
      console.log(err.stack)
    }
    console.log('')
  })

  server.http.listen(parseInt(options.port, 10), options.host)
  return server
}
