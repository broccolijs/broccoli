var path = require('path')
var fs = require('fs')

var handlebars = require('handlebars')
var url = require('url')
var send = require('send')

var errorTemplate = handlebars.compile(fs.readFileSync(path.resolve(__dirname, '../templates/error.html')).toString())

module.exports = function(watcher) {
  return function broccoliMiddleware(request, response, next) {
    watcher.then(function(directory) {
      send(request, url.parse(request.url).pathname)
        .root(directory)
        .on('error', function(err) {
          if (404 === err.status) {
            next()
          } else {
            next(err)
          }
        })
        .pipe(response)
    }, function(buildError) {
      var context = {
        message: buildError.message || buildError,
        file: buildError.file,
        treeDir: buildError.treeDir,
        line: buildError.line,
        column: buildError.column,
        stack: buildError.stack
      }
      response.setHeader('Content-Type', 'text/html')
      response.writeHead(500)
      response.end(errorTemplate(context))
    }).catch(function(err) { console.log(err) })
  }
}
