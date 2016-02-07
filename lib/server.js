var Watcher = require('./watcher')
var middleware = require('./middleware')
var http = require('http')
var https = require('https')
var fs = require('fs')
var path = require('path')
var connect = require('connect')
var printSlowNodes = require('broccoli-slow-trees')

exports.serve = serve
function serve (builder, options) {
  options = options || {}
  var server = {}

  server.watcher = options.watcher || new Watcher(builder)

  server.app = connect().use(middleware(server.watcher))

  if (options.ssl) {
    var sslOptions
    try {
      sslOptions = {
        key: fs.readFileSync(path.join(process.cwd(), 'ssl/server.key')),
        cert: fs.readFileSync(path.join(process.cwd(), 'ssl/server.crt')),
      }
    } catch(e) {
      throw new Error('SSL key and certificate files must be located at ssl/server.key and ssl/server.crt')
    }

    server.server = https.createServer(sslOptions, server.app)
  } else {
    server.server = http.createServer(server.app)  
  }

  server.watcher.watch()
    .catch(function(err) {
      console.log(err && err.stack || err)
    })
    .finally(function() {
      builder.cleanup()
      server.server.close()
    })
    .catch(function(err) {
      console.log('Cleanup error:')
      console.log(err && err.stack || err)
    })
    .finally(function() {
      process.exit(1)
    })

  // We register these so the 'exit' handler removing temp dirs is called
  function cleanupAndExit() {
    return server.watcher.quit()
  }

  process.on('SIGINT', cleanupAndExit)
  process.on('SIGTERM', cleanupAndExit)

  server.watcher.on('change', function() {
    printSlowNodes(builder.outputNodeWrapper)
    console.log('Built - ' + Math.round(builder.outputNodeWrapper.buildState.totalTime) + ' ms @ ' + new Date().toString())
  })

  server.watcher.on('error', function(err) {
    console.log('Built with error:')
    console.log(err.message)
    if (!err.broccoliPayload || !err.broccoliPayload.location.file) {
      console.log('')
      console.log(err.stack)
    }
    console.log('')
  })

  server.server.listen(parseInt(options.port, 10), options.host, function() {
    console.log('Serving on http' + (options.ssl ? 's' : '') + '://' + options.host + ':' + options.port + '\n')    
  })
  return server
}
