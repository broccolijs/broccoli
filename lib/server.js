var path = require('path')
var hapi = require('hapi')
var synchronized = require('synchronized')


exports.serve = serve
function serve (builder) {
  var lastModified = null
  function checkForUpdates () {
    var newLastModified = builder.reader.lastModified()
    if (newLastModified !== lastModified) {
      lastModified = newLastModified
      builder.build()
    }
    setTimeout(checkForUpdates, 100)
  }
  checkForUpdates()

  console.log('Serving on http://localhost:8000/\n')
  var server = hapi.createServer('localhost', 8000, {
    views: {
      engines: {
        html: 'handlebars'
      },
      path: path.join(__dirname, '../templates')
    }
  })

  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      directory: {
        path: function (request) {
          if (!builder.outputTmpDir) {
            throw new Error('Expected builder.outputTmpDir to be set')
          }
          if (builder.buildError) {
            throw new Error('Did not expect builder.buildError to be set')
          }
          return builder.outputTmpDir
        }
      }
    }
  })

  server.ext('onRequest', function (request, next) {
    // `synchronized` delays serving until we've finished building
    synchronized(builder, function (done) {
      if (builder.buildError) {
        var context = {
          message: builder.buildError.message,
          file: builder.buildError.file,
          line: builder.buildError.line,
          column: builder.buildError.column,
          stack: builder.buildError.stack
        }
        // Cannot use request.generateView - https://github.com/spumko/hapi/issues/1137
        var view = new hapi.response.View(request.server._views, 'error', context)
        next(view.code(500))
      } else {
        // Good to go
        next()
      }
      done() // release lock immediately
    })
  })

  // We register these so the 'exit' handler removing our tmpDir is called
  process.on('SIGINT', function () {
    process.exit(1)
  })
  process.on('SIGTERM', function () {
    process.exit(1)
  })

  server.start()
}
