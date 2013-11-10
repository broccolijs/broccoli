var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var walk = require('walk')
var glob = require('glob')
var hapi = require('hapi')
var async = require('async')
var synchronized = require('synchronized')
var Gaze = require('gaze').Gaze
var ES6Transpiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')

var helpers = require('./lib/helpers')


var Generator
exports.Generator = Generator = function (src) {
  this.src = src
  this.preprocessors = {}
  this.compilers = []
}

Generator.prototype.regenerate = function () {
  var self = this

  synchronized(this, function (done) {
    self.buildError = null

    self.cleanup(function (err) {
      // Do not wait for cleanup to finish, just check for errors
      if (err) throw err
    })
    self.createDest() // create pristine directory with new name

    self.preprocess(function (err) {
      if (err) {
        handleError(err)
        return
      }
      self.compile(function (err) {
        if (err) {
          handleError(err)
          return
        }
        console.log('Regenerated')
        done()
      })
    })

    function handleError(err) {
      self.buildError = err
      done()
    }
  })
}

Generator.prototype.registerPreprocessor = function (preprocessor) {
  for (var i = 0; i < preprocessor.extensions.length; i++) {
    if (this.preprocessors[preprocessor.extensions[i]]) {
      console.warn('Warning: Extension ' + preprocessor.extensions[i] + ' already registered; overwriting existing handler.')
    }
    this.preprocessors[preprocessor.extensions[i]] = preprocessor
  }
}

Generator.prototype.registerCompiler = function (compilerFunction) {
  this.compilers.push(compilerFunction)
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
        var destFilePath = self.preprocessTarget + '/' + fileInfo.moduleName + '.' + (preprocessor.targetExtension || extension)
        /* jshint loopfunc: true */
        ;(function (fileInfo) { // closure to capture fileInfo for callback
          preprocessor.run(fileInfo.fullPath, destFilePath, function (err) {
            if (err) {
              // fullPath could at some point contain nasty tmp directories. We
              // may have to find a better way to communicate the path of the
              // file.
              err.file = fileInfo.fullPath
              walker.emit('end', err)
            } else {
              next()
            }
          })
        })(fileInfo)
        /* jshint loopfunc: false */
        break
      }
    }
  }

  walker.on('file', processFile)
  walker.on('symbolicLink', processFile) // TODO: check if target is a file

  walker.on('errors', helpers.unexpectedWalkError)
  walker.on('directoryError', helpers.unexpectedWalkError)
  walker.on('nodeError', helpers.unexpectedWalkError)

  walker.on('end', function (err) {
    callback(err)
  })
}

Generator.prototype.compile = function (callback) {
  var self = this
  if (this.compileTarget != null) throw new Error('self.compileTarget is not null/undefined')
  this.compileTarget = mktemp.createDirSync(this.dest + '/compile_target-XXXXXX.tmp')
  async.eachSeries(self.compilers, function (compiler, callback) {
    compiler.run(self.preprocessTarget, self.compileTarget, callback)
  }, function (err) {
    callback(err)
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

  var gaze = new Gaze([this.src + '/**/*', __dirname + '/vendor/**/*'])
  gaze.on('all', function (event, filepath) {
    console.error(event, filepath)
    // We should debounce this, e.g. when you do `touch *`
    self.regenerate()
  })

  console.log('Serving on http://localhost:8000/')
  var server = hapi.createServer('localhost', 8000, {
    views: {
      engines: {
        html: 'handlebars'
      },
      path: __dirname + '/templates'
    }
  })

  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      directory: {
        path: function (request) {
          if (!self.compileTarget) {
            throw new Error('Expected self.compileTarget to be set')
          }
          if (self.buildError) {
            throw new Error('Did not expect self.buildError to be set')
          }
          return self.compileTarget
        }
      }
    }
  })

  server.ext('onRequest', function (request, next) {
    // `synchronized` delays serving until we've finished regenerating
    synchronized(self, function (done) {
      if (self.buildError) {
        var context = {
          message: self.buildError.message,
          file: self.buildError.file,
          line: self.buildError.line,
          column: self.buildError.column
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

  server.start()

  this.regenerate()
}


var CoffeeScriptPreprocessor = function (options) {
  this.options = {}
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

CoffeeScriptPreprocessor.prototype.run = function (srcFilePath, destFilePath, callback) {
  // Copy options; https://github.com/jashkenas/coffee-script/issues/1924
  var optionsCopy = {}
  for (var key in this.options) {
    if (this.options.hasOwnProperty(key)) {
      optionsCopy[key] = this.options[key]
    }
  }

  var code = fs.readFileSync(srcFilePath).toString()
  var output
  try {
    output = require('coffee-script').compile(code, optionsCopy)
  } catch (err) {
    /* jshint camelcase: false */
    err.line = err.location && err.location.first_line
    err.column = err.location && err.location.first_column
    /* jshint camelcase: true */
    callback(err)
    return
  }
  fs.writeFileSync(destFilePath, output)
  callback()
}

CoffeeScriptPreprocessor.prototype.extensions = ['coffee']
CoffeeScriptPreprocessor.prototype.targetExtension = 'js'


var ES6TemplatePreprocessor = function (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

ES6TemplatePreprocessor.prototype.run = function (srcFilePath, destFilePath, callback) {
  var fileContents = fs.readFileSync(srcFilePath).toString()
  var moduleContents = 'export default ' + this.compileFunction +
    '("' + jsStringEscape(fileContents) + '");\n'
  fs.writeFileSync(destFilePath, moduleContents)
  callback()
}

ES6TemplatePreprocessor.prototype.compileFunction = ''
ES6TemplatePreprocessor.prototype.extensions = [] // set when instantiating
ES6TemplatePreprocessor.prototype.targetExtension = 'js'


var ES6Compiler = function () {}

ES6Compiler.prototype.run = function (src, dest, callback) {
  var appJs = fs.createWriteStream(dest + '/app.js')

  // Write vendor files (this needs to go away)
  var files = fs.readdirSync(__dirname + '/vendor')
  for (var i = 0; i < files.length; i++) {
    var contents = fs.readFileSync(__dirname + '/vendor/' + files[i])
    appJs.write(contents)
  }

  // Make me configurable, or remove me?
  var modulePrefix = 'appkit/'

  var walker = walk.walk(src, {})

  walker.on('names', function (fileRoot, nodeNamesArray) { nodeNamesArray.sort() })

  function processFile (fileRoot, fileStats, next) {
    var extension = 'js'
    if (fileStats.name.slice(-(extension.length + 1)) === '.' + extension) {
      var fileInfo = helpers.getFileInfo(src, fileRoot, fileStats)
      var fileContents = fs.readFileSync(fileInfo.fullPath).toString()
      var compiler, output;
      try {
        compiler = new ES6Transpiler(fileContents, modulePrefix + fileInfo.moduleName)
        output = compiler.toAMD()
      } catch (err) {
        err.file = fileInfo.relativePath
        this.emit('end', err)
        return
      }
      appJs.write(output + '\n')
    }
    next()
  }

  walker.on('file', processFile)
  walker.on('symbolicLink', processFile) // TODO: check if target is a file

  walker.on('errors', helpers.unexpectedWalkError)
  walker.on('directoryError', helpers.unexpectedWalkError)
  walker.on('nodeError', helpers.unexpectedWalkError)

  walker.on('end', function (err) {
    appJs.end()
    callback(err)
  })
}


var StaticFileCompiler = function (options) {
  this.files = []
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
  for (var i = 0; i < this.files.length; i++) {
    if (this.files[i].length > 0 && this.files[i][0] === '/') {
      throw new Error('Patterns must not be absolute: ' + this.files[i])
    }
  }
}

StaticFileCompiler.prototype.run = function (src, dest, callback) {
  var globPatterns = this.files.map(function (pattern) {
    return src + '/' + pattern
  })
  // Constructing globs like `{**/*.html,**/*.png}` should work reliably. If
  // not, we may need to switch to some multi-glob module.
  var combinedPattern = globPatterns.join(',')
  if (globPatterns.length > 1) {
    combinedPattern = '{' + combinedPattern + '}'
  }
  var paths = glob.sync(combinedPattern)
  for (var i = 0; i < paths.length; i++) {
    var relativePath = path.relative(src, paths[i])
    var destPath = dest + '/' + relativePath
    var contents = fs.readFileSync(paths[i])
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, contents)
  }
  callback()
}


var generator = new Generator('app')

generator.registerPreprocessor(new ES6TemplatePreprocessor({
  extensions: ['hbs', 'handlebars'],
  compileFunction: 'Ember.Handlebars.compile'
}))
generator.registerPreprocessor(new CoffeeScriptPreprocessor({
  options: {
    bare: true
  }
}))
generator.registerCompiler(new ES6Compiler)
generator.registerCompiler(new StaticFileCompiler({
  files: ['**/*.html']
}))

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
