var Watcher = require('./watcher')
var path = require('path')
var hapi = require('hapi')
var tinylr = require('tiny-lr')

exports.serve = serve
function serve (builder, options) {
  options = options || {};

  console.log('Serving on http://' + options.host + ':' + options.port + '\n')

  var watcher = new Watcher(builder)

  var server = hapi.createServer(options.host, parseInt(options.port, 10), {
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
          if (!watcher.currentDirectory) throw new Error('Expected directory to be set')
          return watcher.currentDirectory
        }
      }
    }
  })

  server.ext('onRequest', function (request, reply) {
    watcher.then(function(directory) {
      reply() // good to go
    }, function(buildError) {
      var context = {
        message: buildError.message,
        file: buildError.file,
        line: buildError.line,
        column: buildError.column,
        stack: buildError.stack
      }
      reply.view('error', context).code(500)
    });
  })

  // We register these so the 'exit' handler removing temp dirs is called
  process.on('SIGINT', function () {
    process.exit(1)
  })
  process.on('SIGTERM', function () {
    process.exit(1)
  })

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
    console.log('Built')
    liveReload()
  });

  watcher.on('error', function(err) {
    console.log('Built with error:')
    // Should also show file and line/col if present; see cli.js
    console.log(err.stack)
    console.log('')
    liveReload()
  });

  server.start()
}
