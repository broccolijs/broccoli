var hapi = require('hapi')
var watch = require('watch')
var synchronized = require('synchronized')


exports.serve = serve
function serve (builder) {
  var watchedDirectories = builder.reader.getPathsToWatch()
  console.log('Watching the following directories:')
  console.log(watchedDirectories.map(function (d) { return '* ' + d + '\n' }).join(''))

  for (var i = 0; i < watchedDirectories.length; i++) {
    /* jshint loopfunc: true */
    watch.watchTree(watchedDirectories[i], {
      interval: 30
    }, function () {
      builder.regenerate()
    })
    /* jshint loopfunc: false */
  }

  console.log('Serving on http://localhost:8000/\n')
  var server = hapi.createServer('localhost', 8000, {
    views: {
      engines: {
        html: 'handlebars'
      },
      path: __dirname + '/../templates'
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
    // `synchronized` delays serving until we've finished regenerating
    synchronized(builder, function (done) {
      if (builder.buildError) {
        var context = {
          message: builder.buildError.message,
          file: builder.buildError.file,
          line: builder.buildError.line,
          column: builder.buildError.column
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
    process.exit()
  })
  process.on('SIGTERM', function () {
    process.exit()
  })

  server.start()

  builder.regenerate()
}
