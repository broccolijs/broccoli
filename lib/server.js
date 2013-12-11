var path = require('path')
var hapi = require('hapi')
var tinylr = require('tiny-lr')
var synchronized = require('synchronized')


exports.serve = serve
function serve (builder) {
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

  var livereloadServer = new tinylr.Server
  livereloadServer.listen(35729, function (err) {
    if(err) {
      throw err
    }
  })

  var statsHash = null
  function checkForUpdates () {
    var newStatsHash = builder.reader.statsHash()
    if (newStatsHash !== statsHash) {
      statsHash = newStatsHash
      builder.build(null, function (err) {
        // We could pass files: glob.sync('**', {cwd: builder.outputTmpDir}),
        // but this spams stdout with messages and Chrome LiveReload doesn't
        // seem to care about the specific files.
        livereloadServer.changed({body: {files: ['LiveReload files']}})
      })
    }
    setTimeout(checkForUpdates, 100)
  }
  checkForUpdates()

  server.start()
}
