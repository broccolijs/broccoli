var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var walk = require('walk')
var hapi = require('hapi')
var synchronized = require('synchronized')
var Gaze = require('gaze').Gaze
var ES6Compiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')


var Generator
exports.Generator = Generator = function (src) {
  this.src = src
}

Generator.prototype.regenerate = function () {
  var self = this
  synchronized(this, function (done) {
    self.cleanup(function() { /* do not wait for cleanup to finish */ })
    self.createDest() // create pristine directory with new name

    self.writeAppJs(function () {
      self.copyHtmlFiles(function () {
        console.log('Regenerated')
        done()
      })
    })
  })
}

Generator.prototype.writeAppJs = function (callback) {
  var self = this
  appJs = fs.createWriteStream(this.dest + '/app.js')

  // Write vendor files (this needs to go away)
  var files = fs.readdirSync(__dirname + '/vendor')
  for (var i = 0; i < files.length; i++) {
    contents = fs.readFileSync(__dirname + '/vendor/' + files[i])
    appJs.write(contents)
  }

  // Write app files
  var modulePrefix = 'appkit/'

  function compileJavascripts(callback) {
    walkFiles(self.src, 'js', function (fileInfo, fileStats, next) {
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var compiler = new ES6Compiler(fileContents, modulePrefix + fileInfo.moduleName)
      var output = compiler.toAMD() // ERR: handle exceptions
      appJs.write(output + "\n")
      next()
    }, function () {
      callback()
    })
  }

  function compileTemplates(callback) {
    walkFiles(self.src, 'hbs', function (fileInfo, fileStats, next) {
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var moduleContents = 'export default Ember.Handlebars.compile("' +
        jsStringEscape(fileContents) + '");'
      var compiler = new ES6Compiler(moduleContents, modulePrefix + fileInfo.moduleName)
      var output = compiler.toAMD() // ERR: handle exceptions
      appJs.write(output + "\n")
      next()
    }, function () {
      callback()
    })
  }

  compileJavascripts(function () {
    compileTemplates(function () {
      appJs.end()
      callback()
    })
  })
}

Generator.prototype.copyHtmlFiles = function (callback) {
  var self = this
  walkFiles(this.src, 'html', function (fileInfo, fileStats, next) {
    var contents = fs.readFileSync(fileInfo.fullPath)
    fs.writeFileSync(self.dest + '/' + fileInfo.relativePath, contents)
    next()
  }, function () {
    callback()
  })
}

Generator.prototype.createDest = function () {
  if (this.dest == null) {
    this.dest = mktemp.createDirSync('broccoli-XXXXXX.tmp')
  }
  return this.dest
}

Generator.prototype.cleanup = function (callback) {
  if (this.dest != null) {
    rimraf(this.dest, callback)
  }
  this.dest = null
}

Generator.prototype.serve = function () {
  var self = this

  this.regenerate()

  var gaze = new Gaze([this.src + '/**/*', __dirname + '/vendor/**/*'])
  gaze.on('all', function () {
    // We should debounce this, e.g. when you do `touch *`
    self.regenerate()
  })

  console.log('Serving on http://localhost:8000/')
  var server = hapi.createServer('localhost', 8000)

  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      directory: {
        path: function (request) {
          return self.dest
        }
      }
    }
  })

  server.ext('onRequest', function (request, next) {
    // `synchronized` delays serving until we've finished regenerating
    synchronized(self, function (done) {
      next()
      done()
    })
  })

  server.start()
}


// Tree recursion helper to iterate over files with given extension
var walkFiles = function (root, extension, fileCallback, endCallback) {
  var walker = walk.walk(root, {})

  walker.on('names', function (fileRoot, nodeNamesArray) {
    nodeNamesArray.sort()
  })

  walker.on('file', function (fileRoot, fileStats, next) {
    if (fileStats.name.slice(-(extension.length + 1)) === '.' + extension) {
      var fileInfo = {}
      fileInfo.fullPath = fileRoot + '/' + fileStats.name
      fileInfo.relativePath = fileInfo.fullPath.slice(root.length + 1)
      fileInfo.moduleName = fileInfo.relativePath.slice(0, -(extension.length + 1))
      fileCallback(fileInfo, fileStats, next)
    } else {
      next()
    }
  })

  walker.on('errors', function (fileRoot, nodeStatsArray, next) {
    // ERR
    console.error('Warning: unhandled error(s)', nodeStatsArray)
    next()
  })

  walker.on('end', function () {
    endCallback()
  })
}


var generator = new Generator('app')
process.on('SIGINT', function () {
  synchronized(generator, function () {
    generator.cleanup(function () {
      process.exit()
    })
  })
  setTimeout(function () {
    console.error('Error: Something slow stopped us from cleaning up in time.')
    console.error('This should *never* happen. Please file a bug report.')
    process.exit()
  }, 300)
})
generator.serve()
