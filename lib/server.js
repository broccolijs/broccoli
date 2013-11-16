var hapi = require('hapi')
var watch = require('watch')
var synchronized = require('synchronized')


exports.serve = serve
function serve (generator) {
  var watchedDirectories = generator.packages.map(function (p) { return p.srcDir })
  console.log('Watching the following directories:')
  console.log(watchedDirectories.map(function (d) { return '* ' + d + '\n' }).join(''))
  for (var i = 0; i < watchedDirectories.length; i++) {
    watch.watchTree(watchedDirectories[i], {
      interval: 30
    }, function () {
      generator.regenerate()
    })
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
          if (!generator.outputTmpDir) {
            throw new Error('Expected generator.outputTmpDir to be set')
          }
          if (generator.buildError) {
            throw new Error('Did not expect generator.buildError to be set')
          }
          return generator.outputTmpDir
        }
      }
    }
  })

  server.ext('onRequest', function (request, next) {
    // `synchronized` delays serving until we've finished regenerating
    synchronized(generator, function (done) {
      if (generator.buildError) {
        var context = {
          message: generator.buildError.message,
          file: generator.buildError.file,
          line: generator.buildError.line,
          column: generator.buildError.column
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

  generator.regenerate()
}
