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
  this.preprocessors = []
  this.compilers = []
}

Generator.prototype.regenerate = function () {
  var self = this

  synchronized(this, function (done) {
    self.buildError = null

    self.cleanup()
    self.createDest() // create pristine directory with new name

    self.preprocess(function (err) {
      if (err) {
        handleError(err)
        return
      }

      // Copy vendor directory. This will need to go away.
      var vendorFiles = glob.sync('**/*', {cwd: 'vendor'})
      for (var i = 0; i < vendorFiles.length; i++) {
        var fileContents = fs.readFileSync('vendor/' + vendorFiles[i])
        fs.writeFileSync(self.preprocessDest + '/' + vendorFiles[i], fileContents)
      }

      self.compile(function (err) {
        if (err) {
          console.log('Regenerated with error')
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
  this.preprocessors.push(preprocessor)
}

Generator.prototype.registerCompiler = function (compilerFunction) {
  this.compilers.push(compilerFunction)
}

Generator.prototype.preprocess = function (callback) {
  var self = this

  if (this.preprocessDest != null) throw new Error('self.preprocessDest is not null/undefined')
  this.preprocessDest = mktemp.createDirSync(this.dest + '/preprocess_dest-XXXXXX.tmp')

  var srcRoot = this.src
  var walker = walk.walk(srcRoot, {})

  // Be deterministic
  walker.on('names', function (fileRoot, nodeNamesArray) { nodeNamesArray.sort() })

  walker.on('directory', function (dirRoot, dirStats, next) {
    var relativePath = dirRoot.slice(srcRoot.length + 1)
    if (relativePath.length > 0) relativePath = relativePath + '/'
    fs.mkdirSync(self.preprocessDest + '/' + relativePath + dirStats.name)
    next()
  })

  // These methods should be moved into a preprocessor base class, so
  // preprocessors can override the logic.

  function preprocessorGetDestFilePath (preprocessor, filePath) {
    var extension = path.extname(filePath).replace(/^\./, '')
    if (preprocessor.constructor.name === 'CopyPreprocessor') {
      // Gah, this special-casing does not belong here
      return filePath
    }
    if ((preprocessor.extensions || []).indexOf(extension) !== -1) {
      if (preprocessor.targetExtension) {
        return filePath.slice(0, -extension.length) + preprocessor.targetExtension
      } else {
        return filePath
      }
    }
    return null
  }

  function preprocessorsForFile (filePath) {
    var allPreprocessors = self.preprocessors.slice()
    var preprocessors = []
    while (allPreprocessors.length > 0) {
      var destPath, preprocessor = null
      for (var i = 0; i < allPreprocessors.length; i++) {
        destPath = preprocessorGetDestFilePath(allPreprocessors[i], filePath)
        if (destPath != null) {
          preprocessor = allPreprocessors[i]
          allPreprocessors.splice(i, 1)
          break
        }
      }
      if (preprocessor != null) {
        preprocessors.push(preprocessor)
        filePath = destPath
      } else {
        // None of the remaining preprocessors are applicable
        break
      }
    }
    if (preprocessors.length === 0) {
      preprocessors.push(new CopyPreprocessor)
    }
    return preprocessors
  }

  function processFile (fileRoot, fileStats, next) {
    var fileInfo = helpers.getFileInfo(srcRoot, fileRoot, fileStats)
    var preprocessors = preprocessorsForFile(fileInfo.relativePath)
    var filePath = fileInfo.fullPath
    var relativePath = fileInfo.relativePath
    var tmpDir, oldTmpDir
    async.eachSeries(preprocessors, function (preprocessor, callback) {
      var newRelativePath = preprocessorGetDestFilePath(preprocessor, relativePath)
      if (newRelativePath == null) {
        throw new Error('Unexpectedly could not find destination file path anymore for ' + relativePath + ' using ' + preprocessor.constructor.name)
      }
      // console.log(relativePath, '->', newRelativePath, 'using', preprocessor.constructor.name)
      oldTmpDir = tmpDir
      tmpDir = mktemp.createDirSync(self.dest + '/preprocess-XXXXXX.tmp')
      var newFilePath = tmpDir + '/' + path.basename(newRelativePath)
      var info = {
        moduleName: fileInfo.moduleName
      }
      preprocessor.run(filePath, newFilePath, info, function (err) {
        if (err) {
          err.file = relativePath // augment
          callback(err)
        } else {
          relativePath = newRelativePath
          filePath = newFilePath
          if (oldTmpDir != null) helpers.backgroundRimraf(oldTmpDir)
          callback()
        }
      })
    }, function (err) {
      if (err) {
        walker.emit('end', err)
      } else {
        var fileContents = fs.readFileSync(filePath)
        var destFilePath = self.preprocessDest + '/' + relativePath
        fs.writeFileSync(destFilePath, fileContents)
        if (tmpDir != null) helpers.backgroundRimraf(tmpDir)
        next()
      }
    })
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
  if (this.compileDest != null) throw new Error('self.compileDest is not null/undefined')
  this.compileDest = mktemp.createDirSync(this.dest + '/compile_dest-XXXXXX.tmp')
  async.eachSeries(self.compilers, function (compiler, callback) {
    compiler.run(self.preprocessDest, self.compileDest, callback)
  }, function (err) {
    callback(err)
  })
}

Generator.prototype.createDest = function () {
  if (this.dest != null) throw new Error('Expected generator.dest to be null/undefined; did something go out of sync?')
  this.dest = mktemp.createDirSync('broccoli-XXXXXX.tmp')
}

Generator.prototype.cleanup = function () {
  if (this.dest != null) {
    helpers.backgroundRimraf(this.dest)
  }
  this.dest = null
  this.preprocessDest = null
  this.compileDest = null
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
          if (!self.compileDest) {
            throw new Error('Expected self.compileDest to be set')
          }
          if (self.buildError) {
            throw new Error('Did not expect self.buildError to be set')
          }
          return self.compileDest
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


// Special pass-through preprocessor that applies when no other preprocessor
// matches
function CopyPreprocessor () {}

CopyPreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath)
  fs.writeFileSync(destFilePath, fileContents)
  callback()
}

CopyPreprocessor.extensions = []
CopyPreprocessor.targetExtension = null


function CoffeeScriptPreprocessor (options) {
  this.options = {}
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

CoffeeScriptPreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
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


function ES6TemplatePreprocessor (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

ES6TemplatePreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath).toString()
  var moduleContents = 'export default ' + this.compileFunction +
    '("' + jsStringEscape(fileContents) + '");\n'
  fs.writeFileSync(destFilePath, moduleContents)
  callback()
}

ES6TemplatePreprocessor.prototype.compileFunction = ''
ES6TemplatePreprocessor.prototype.extensions = [] // set when instantiating
ES6TemplatePreprocessor.prototype.targetExtension = 'js'


function ES6TranspilerPreprocessor (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

ES6TranspilerPreprocessor.prototype.extensions = ['js']

ES6TranspilerPreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath).toString()
  var compiler, output;
  try {
    compiler = new ES6Transpiler(fileContents, info.moduleName)
    output = compiler.toAMD()
  } catch (err) {
    callback(err)
    return
  }
  fs.writeFileSync(destFilePath, output)
  callback()
}


function JavaScriptConcatenatorCompiler (options) {
  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key]
    }
  }
}

JavaScriptConcatenatorCompiler.prototype.run = function (src, dest, callback) {
  var self = this
  mkdirp.sync(dest + '/' + path.dirname(this.outputPath))
  var writeStream = fs.createWriteStream(dest + '/' + this.outputPath)

  for (var i = 0; i < this.files.length; i++) {
    var pattern = this.files[i]
    var matchingFiles = glob.sync(pattern, {
      cwd: src
    })
    if (matchingFiles.length === 0) {
      callback(new Error('Path or pattern "' + pattern + '" did not match any files'))
      return
    }
    for (var j = 0; j < matchingFiles.length; j++) {
      var relativePath = matchingFiles[j]
      var fullPath = src + '/' + relativePath
      var fileContents = fs.readFileSync(fullPath).toString()
      if (!self.useSourceURL) {
        writeStream.write(fileContents + '\n')
      } else {
        // Should pull out copyright comment headers
        var evalExpression = 'eval("' +
          jsStringEscape(fileContents) +
          '//# sourceURL=' + jsStringEscape(relativePath) +
          '");\n'
        writeStream.write(evalExpression)
      }
    }
  }

  writeStream.end()
  callback()
}

JavaScriptConcatenatorCompiler.prototype.useSourceURL = true
JavaScriptConcatenatorCompiler.prototype.outputPath = 'app.js'


function StaticFileCompiler (options) {
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


var generator = new Generator('assets')

generator.registerPreprocessor(new ES6TemplatePreprocessor({
  extensions: ['hbs', 'handlebars'],
  compileFunction: 'Ember.Handlebars.compile'
}))
generator.registerPreprocessor(new CoffeeScriptPreprocessor({
  options: {
    bare: true
  }
}))
generator.registerPreprocessor(new ES6TranspilerPreprocessor)
generator.registerCompiler(new JavaScriptConcatenatorCompiler({
  files: [
    'jquery.js',
    'almond.js',
    'handlebars.js',
    'ember.js',
    'ember-data.js',
    'ember-resolver.js',
    'appkit/**/*.js']
}))
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
