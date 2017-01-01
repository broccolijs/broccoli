var middleware = require('./middleware')
var http = require('http')
var connect = require('connect')
var printSlowNodes = require('broccoli-slow-trees')

exports.serve = serve
function serve (watcher, host, port) {
  if (watcher.constructor.name !== 'Watcher') throw new Error('Expected Watcher instance')
  if (typeof host !== 'string') throw new Error('Expected host to bind to (e.g. "localhost")')
  if (typeof port !== 'number' || port !== port) throw new Error('Expected port to bind to (e.g. 4200)')

  var server = {}

  console.log('Serving on http://' + host + ':' + port + '\n')

  server.watcher = watcher
  server.builder = server.watcher.builder

  server.app = connect().use(middleware(server.watcher))

  server.http = http.createServer(server.app)

  // We register these so the 'exit' handler removing temp dirs is called
  function cleanupAndExit() {
    return server.watcher.quit()
  }

  process.on('SIGINT', cleanupAndExit)
  process.on('SIGTERM', cleanupAndExit)

  server.watcher.on('buildSuccess', function() {
    printSlowNodes(server.builder.outputNodeWrapper)
    console.log('Built - ' + Math.round(server.builder.outputNodeWrapper.buildState.totalTime) + ' ms @ ' + new Date().toString())
  })

  server.watcher.on('buildFailure', function(err) {
    console.log('Built with error:')
    console.log(err.message)
    if (!err.broccoliPayload || !err.broccoliPayload.location.file) {
      console.log('')
      console.log(err.stack)
    }
    console.log('')
  })

  server.watcher.start()
    .catch(function(err) {
      console.log(err && err.stack || err)
    })
    .finally(function() {
      server.builder.cleanup()
      server.http.close()
    })
    .catch(function(err) {
      console.log('Cleanup error:')
      console.log(err && err.stack || err)
    })
    .finally(function() {
      process.exit(1)
    })

  server.http.listen(parseInt(port, 10), host)
  return server
}
