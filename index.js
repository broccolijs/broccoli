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

    self.preprocess(function () {
      self.compile(function () {
        console.log('Regenerated')
        done()
      })
    })
  })
}

Generator.prototype.preprocess = function (callback) {
  var self = this

  if (this.preprocessTarget != null) throw new Error('self.preprocessTarget is not null/undefined')
  this.preprocessTarget = mktemp.createDirSync(this.dest + '/preprocess_target-XXXXXX.tmp')

  var srcRoot = this.src
  var walker = walk.walk(srcRoot, {})

  // Be deterministic
  walker.on('names', function (fileRoot, nodeNamesArray) { nodeNamesArray.sort() })

  walker.on('directory', function (dirRoot, dirStats, next) {
    relativePath = dirRoot.slice(srcRoot.length + 1)
    if (relativePath.length > 0) relativePath = relativePath + '/'
    fs.mkdirSync(self.preprocessTarget + '/' + relativePath + dirStats.name)
    next()
  })

  function processFile (fileRoot, fileStats, next) {
    var fileInfo = getFileInfo(srcRoot, fileRoot, fileStats)
    if (fileInfo.extension == 'hbs' || fileInfo.extension == 'handlebars') {
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var moduleContents = 'export default Ember.Handlebars.compile("' +
        jsStringEscape(fileContents) + '");\n'
      fs.writeFileSync(self.preprocessTarget + '/' + fileInfo.moduleName + '.js', moduleContents)
      next()
    } else {
      // Wish we could hardlink, but that triggers inotify/watchFile on the
      // original file because the link count increases. We'll have to work
      // around that first.
      var depth = (self.preprocessTarget + '/' + fileInfo.relativePath).split('/').length - 1
      var parentDirs = new Array(depth + 1).join('../')
      fs.symlinkSync(parentDirs + fileInfo.fullPath, self.preprocessTarget + '/' + fileInfo.relativePath)
      next()
    }
  }

  walker.on('file', processFile)
  walker.on('symbolicLink', processFile) // TODO: check if target is a file

  walker.on('errors', function (fileRoot, nodeStatsArray, next) {
    // ERR
    console.error('Warning: unhandled error(s)', nodeStatsArray)
    next()
  })

  walker.on('end', function () {
    callback()
  })
}

Generator.prototype.compile = function (callback) {
  var self = this
  if (this.compileTarget != null) throw new Error('self.compileTarget is not null/undefined')
  this.compileTarget = mktemp.createDirSync(this.dest + '/compile_target-XXXXXX.tmp')
  self.writeAppJs(self.preprocessTarget, self.compileTarget, function () {
    self.copyHtmlFiles(self.preprocessTarget, self.compileTarget, function () {
      callback()
    })
  })
}

Generator.prototype.writeAppJs = function (src, dest, callback) {
  var self = this
  appJs = fs.createWriteStream(dest + '/app.js')

  // Write vendor files (this needs to go away)
  var files = fs.readdirSync(__dirname + '/vendor')
  for (var i = 0; i < files.length; i++) {
    contents = fs.readFileSync(__dirname + '/vendor/' + files[i])
    appJs.write(contents)
  }

  // Make me configurable, or remove me?
  modulePrefix = 'appkit/'

  // Write app files
  function compileJavascripts(callback) {
    walkFiles(src, 'js', function (fileInfo, fileStats, next) {
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var compiler = new ES6Compiler(fileContents, modulePrefix + fileInfo.moduleName)
      var output = compiler.toAMD() // ERR: handle exceptions
      appJs.write(output + "\n")
      next()
    }, function () {
      callback()
    })
  }

  compileJavascripts(function () {
    appJs.end()
    callback()
  })
}

Generator.prototype.copyHtmlFiles = function (src, dest, callback) {
  var self = this
  walkFiles(src, 'html', function (fileInfo, fileStats, next) {
    var contents = fs.readFileSync(fileInfo.fullPath)
    fs.writeFileSync(dest + '/' + fileInfo.relativePath, contents)
    next()
  }, function () {
    callback()
  })
}

Generator.prototype.createDest = function () {
  if (this.dest != null) throw new Error('Expected generator.dest to be null/undefined; did something go out of sync?')
  this.dest = mktemp.createDirSync('broccoli-XXXXXX.tmp')
}

Generator.prototype.cleanup = function (callback) {
  if (this.dest != null) {
    rimraf(this.dest, callback)
  }
  this.dest = null
  this.preprocessTarget = null
  this.compileTarget = null
}

Generator.prototype.serve = function () {
  var self = this

  this.regenerate()

  var gaze = new Gaze([this.src + '/**/*', __dirname + '/vendor/**/*'])
  gaze.on('all', function (event, filepath) {
    console.error(event, filepath)
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
          return self.compileTarget
        }
      }
    }
  })

  server.ext('onRequest', function (request, next) {
    // `synchronized` delays serving until we've finished regenerating
    synchronized(self, function (done) {
      done() // release lock immediately
      next()
    })
  })

  server.start()
}


// Tree recursion helper to iterate over files with given extension
function walkFiles (root, extension, fileCallback, endCallback) {
  var walker = walk.walk(root, {})

  walker.on('names', function (fileRoot, nodeNamesArray) {
    nodeNamesArray.sort()
  })

  function processFile (fileRoot, fileStats, next) {
    if (fileStats.name.slice(-(extension.length + 1)) === '.' + extension) {
      var fileInfo = getFileInfo(root, fileRoot, fileStats)
      fileCallback(fileInfo, fileStats, next)
    } else {
      next()
    }
  }

  walker.on('file', processFile)
  walker.on('symbolicLink', processFile) // TODO: check if target is a file

  walker.on('errors', function (fileRoot, nodeStatsArray, next) {
    // ERR
    console.error('Warning: unhandled error(s)', nodeStatsArray)
    next()
  })

  walker.on('end', function () {
    endCallback()
  })
}

function getFileInfo(root, fileRoot, fileStats) {
  var fileInfo = {}
  fileInfo.fullPath = fileRoot + '/' + fileStats.name
  fileInfo.relativePath = fileInfo.fullPath.slice(root.length + 1)
  var match = /.\.([^./]+)$/.exec(fileStats.name)
  if (match) {
    fileInfo.extension = match[1]
    // Note: moduleName is also used to construct new file paths; maybe it
    // shouldn't
    fileInfo.moduleName = fileInfo.relativePath.slice(0, -(fileInfo.extension.length + 1))
  } else {
    fileInfo.moduleName = fileInfo.relativePath
  }
  return fileInfo
}


var generator = new Generator('app')
process.on('SIGINT', function () {
  synchronized(generator, function () {
    generator.cleanup(function () {
      process.exit()
    })
  })
  setTimeout(function () {
    console.error('Error: Something is slow or jammed, and we could not clean up in time.')
    console.error('This should *never* happen. Please file a bug report.')
    process.exit()
  }, 300)
})
generator.serve()
