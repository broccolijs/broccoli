var fs = require('fs')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var walk = require('walk')
var hapi = require('hapi')
var synchronized = require('synchronized')
var Gaze = require('gaze').Gaze
var ES6Compiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')

var helpers = require('./lib/helpers')


var Generator
exports.Generator = Generator = function (src) {
  this.src = src
  this.preprocessors = {}
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

Generator.prototype.registerPreprocessor = function (preprocessorFunction) {
  for (var i = 0; i < preprocessorFunction.extensions.length; i++) {
    if (this.preprocessors[preprocessorFunction.extensions[i]]) {
      console.warn('Warning: Extension ' + preprocessorFunction.extensions[i] + ' already registered; overwriting existing handler.')
    }
    this.preprocessors[preprocessorFunction.extensions[i]] = preprocessorFunction
  }
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
    var relativePath = dirRoot.slice(srcRoot.length + 1)
    if (relativePath.length > 0) relativePath = relativePath + '/'
    fs.mkdirSync(self.preprocessTarget + '/' + relativePath + dirStats.name)
    next()
  })

  function processFile (fileRoot, fileStats, next) {
    var fileInfo = helpers.getFileInfo(srcRoot, fileRoot, fileStats)
    var extensions = []
    for (var e in self.preprocessors) {
      if (self.preprocessors.hasOwnProperty(e)) {
        extensions.push(e)
      }
    }
    extensions.sort()
    extensions.push(null) // copy if no preprocessor found
    for (var i = 0; i < extensions.length; i++) {
      var extension = extensions[i]
      if (extension === null) {
        // No preprocessor; copy
        var depth = (self.preprocessTarget + '/' + fileInfo.relativePath).split('/').length - 1
        var parentDirs = new Array(depth + 1).join('../')
        fs.symlinkSync(parentDirs + fileInfo.fullPath, self.preprocessTarget + '/' + fileInfo.relativePath)
        next()
        break
      } else if (fileInfo.extension === extension) {
        var preprocessor = self.preprocessors[extension]
        var targetPath = self.preprocessTarget + '/' + fileInfo.moduleName + '.' + (preprocessor.targetExtension || extension)
        preprocessor(fileInfo, targetPath, next)
        break
      }
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
  var appJs = fs.createWriteStream(dest + '/app.js')

  // Write vendor files (this needs to go away)
  var files = fs.readdirSync(__dirname + '/vendor')
  for (var i = 0; i < files.length; i++) {
    var contents = fs.readFileSync(__dirname + '/vendor/' + files[i])
    appJs.write(contents)
  }

  // Make me configurable, or remove me?
  var modulePrefix = 'appkit/'

  // Write app files
  function compileJavascripts(callback) {
    helpers.walkFiles(src, 'js', function (fileInfo, fileStats, next) {
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var compiler = new ES6Compiler(fileContents, modulePrefix + fileInfo.moduleName)
      var output = compiler.toAMD() // ERR: handle exceptions
      appJs.write(output + '\n')
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
  helpers.walkFiles(src, 'html', function (fileInfo, fileStats, next) {
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


function emberHandlebarsPreprocessor(fileInfo, targetPath, callback) {
  var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
  var moduleContents = 'export default Ember.Handlebars.compile("' +
    jsStringEscape(fileContents) + '");\n'
  fs.writeFileSync(targetPath, moduleContents)
  callback()
}

emberHandlebarsPreprocessor.extensions = ['hbs', 'handlebars']
emberHandlebarsPreprocessor.targetExtension = 'js'

var generator = new Generator('app')
generator.registerPreprocessor(emberHandlebarsPreprocessor)
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
