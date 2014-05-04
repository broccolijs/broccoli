var path = require('path')
var fs = require('fs')

var handlebars = require('handlebars')
var url = require('url')
var mime = require('mime')

var errorTemplate = handlebars.compile(fs.readFileSync(path.resolve(__dirname, '../templates/error.html')).toString())

module.exports = function(watcher) {
  return function broccoliMiddleware(request, response, next) {
    watcher.then(function(hash) {
      var directory = path.normalize(hash.directory)
      var urlObj = url.parse(request.url)
      var filename = path.join(directory, decodeURIComponent(urlObj.pathname))
      var stat, lastModified, type, charset, buffer

      // this middleware is for development use only

      // contains null byte or escapes directory
      if (filename.indexOf('\0') !== -1 || filename.indexOf(directory) !== 0) {
        response.writeHead(400)
        response.end()
        return
      }

      // handle document index
      if (filename[filename.length - 1] === path.sep) {
        filename += 'index.html'
      }

      try {
        stat = fs.statSync(filename)
      } catch (e) {
        // 404
        next()
        return
      }

      // if directory redirect with trailing slash
      if (stat.isDirectory()) {
        urlObj.pathname += '/'
        response.setHeader('Location', url.format(urlObj))
        response.writeHead(301)
        response.end()
        return
      }

      lastModified = stat.mtime.toUTCString()
      response.setHeader('Last-Modified', lastModified)
      // nginx style treat last-modified as a tag since browsers echo it back
      if (request.headers['if-modified-since'] === lastModified) {
        response.writeHead(304)
        response.end()
        return
      }

      type = mime.lookup(filename)
      charset = mime.charsets.lookup(type)
      if (charset) {
        type += '; charset=' + charset
      }
      // we don't want stale build files
      response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
      response.setHeader('Content-Length', stat.size)
      response.setHeader('Content-Type', type)

      // read file sync so we don't hold open the file creating a race with
      // the builder (Windows does not allow us to delete while the file is open).
      buffer = fs.readFileSync(filename)
      response.writeHead(200)
      response.end(buffer)
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
