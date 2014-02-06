var path = require('path')
var hapi = require('hapi')
var tinylr = require('tiny-lr')
var synchronized = require('synchronized')


exports.serve = serve
function serve (builder) {
  console.log('Serving on http://0.0.0.0:8000/\n')

  var buildError = null
  var outputTmpDir = null

  var server = hapi.createServer('0.0.0.0', 8000, {
    views: {
      engines: {
        html: 'handlebars'
      },
      path: path.join(__dirname, '../templates')
    },
    state: {
      cookies: {
        // If we ever need to parse cookies, be sure to set
        // failAction/strictHeader to be tolerant
        parse: false
      }
    }
  })

  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      directory: {
        path: function (request) {
          if (!outputTmpDir) throw new Error('Expected outputTmpDir to be set')
          if (buildError) throw new Error('Did not expect buildError to be set')
          return outputTmpDir
        }
      }
    }
  })

  server.ext('onRequest', function (request, reply) {
    // `synchronized` delays serving until we've finished building
    synchronized(builder, function (done) {
      if (buildError) {
        var context = {
          message: buildError.message,
          file: buildError.file,
          line: buildError.line,
          column: buildError.column,
          stack: buildError.stack
        }
        reply.view('error', context).code(500)
      } else if (!outputTmpDir) {
        // Could happen if we get a request in before the first build starts
        reply('Error: No build output found').type('text/plain').code(500)
      } else {
        reply() // good to go
      }
      done() // release lock immediately
    })
  })

  // We register these so the 'exit' handler removing temp dirs is called
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
    var newStatsHash = builder.treesRead.map(function (tree) {
      return tree.statsHash != null ? tree.statsHash() : ''
    }).join('\x00')
    if (newStatsHash !== statsHash) {
      statsHash = newStatsHash
      builder.build()
        .then(function (dir) {
          outputTmpDir = dir
          buildError = null
          console.log('Built')
        }, function (err) {
          outputTmpDir = null
          buildError = err
          console.log('Built with error')
        })
        .finally(function () {
          // We could pass files: glob.sync('**', {cwd: ...}), but this spams
          // stdout with messages and Chrome LiveReload doesn't seem to care
          // about the specific files.
          livereloadServer.changed({body: {files: ['LiveReload files']}})
        })
    }
    setTimeout(checkForUpdates, 100)
  }
  checkForUpdates()

  server.start()
}
