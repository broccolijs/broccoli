var fs = require('fs')
var path = require('path')
var mktemp = require('mktemp')
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')
var glob = require('glob')
var hapi = require('hapi')
var async = require('async')
var synchronized = require('synchronized')
var watch = require('watch')
var ES6Transpiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')

var helpers = require('./lib/helpers')


exports.Generator = Generator
function Generator (options) {
  this.packages = options.packages
  this.preprocessors = []
  this.compilers = []
  // Debounce logic; should probably be extracted
  this.postRegenerateLock = {}
  this.regenerateScheduled = false
  this.lockReleaseTimer = null
  this.lockReleaseFunction = null
  this.lockReleaseFirstScheduledAt = null
}

Generator.prototype.regenerate = function () {
  var self = this

  function scheduleLockReleaseTimer () {
    if (!self.lockReleaseFirstScheduledAt) self.lockReleaseFirstScheduledAt = Date.now()
    self.lockReleaseTimer = setTimeout(self.lockReleaseFunction, 100)
  }

  if (self.lockReleaseTimer && Date.now() < self.lockReleaseFirstScheduledAt + 1000) {
    // Reschedule running timer because we keep getting events, but never put
    // off more than 1000 milliseconds in total
    clearTimeout(self.lockReleaseTimer)
    scheduleLockReleaseTimer()
  }

  if (this.regenerateScheduled) return
  this.regenerateScheduled = true

  synchronized(this, function (done) {
    self.regenerateScheduled = false

    var startTime = Date.now()

    self.buildError = null

    self.cleanup()
    self.createDest() // create pristine directory with new name

    self.preprocess(function (err) {
      if (err) {
        finish(err)
        return
      }
      self.compile(function (err) {
        finish(err)
      })
    })

    function finish (err) {
      if (err) self.buildError = err
      console.error('Regenerated ' + (err ? 'with error ' : '') + '(' + (Date.now() - startTime) + ' ms)')
      releaseAfterDelay()
    }

    function releaseAfterDelay () {
      self.lockReleaseFunction = function () {
        self.lockReleaseTimer = null
        self.lockReleaseFunction = null
        self.lockReleaseFirstScheduledAt = null
        done()
      }
      scheduleLockReleaseTimer()
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

  async.eachSeries(this.packages, function (package, packageCallback) {
    var paths = glob.sync('**', {
      cwd: package.srcDir,
      dot: true, // should we ignore .dotfiles?
      mark: true, // trailing slash for directories; requires additional stat calls
      strict: true
    })
    async.eachSeries(paths, function (path, pathCallback) {
      if (path.slice(-1) === '/') {
        mkdirp.sync(self.preprocessDest + '/' + path)
        pathCallback()
      } else {
        var preprocessors = [].concat(package.preprocessors, self.preprocessors)
        processFile(package.srcDir, path, preprocessors, function (err) {
          pathCallback(err)
        })
      }
    }, function (err) {
      packageCallback(err)
    })
  }, function (err) {
    callback(err)
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

  function preprocessorsForFile (allPreprocessors, filePath) {
    allPreprocessors = allPreprocessors.slice()
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

  function processFile (srcDir, relativePath, preprocessors, callback) {
    var preprocessorsToApply = preprocessorsForFile(preprocessors, relativePath)
    var fullPath = srcDir + '/' + relativePath
    var tmpDir, oldTmpDir
    async.eachSeries(preprocessorsToApply, function (preprocessor, eachCallback) {
      var newRelativePath = preprocessorGetDestFilePath(preprocessor, relativePath)
      if (newRelativePath == null) {
        throw new Error('Unexpectedly could not find destination file path anymore for ' + relativePath + ' using ' + preprocessor.constructor.name)
      }
      // console.log(relativePath, '->', newRelativePath, 'using', preprocessor.constructor.name)
      oldTmpDir = tmpDir
      tmpDir = mktemp.createDirSync(self.dest + '/preprocess-XXXXXX.tmp')
      var newFullPath = tmpDir + '/' + path.basename(newRelativePath)
      var info = {
        moduleName: relativePath.replace(/\.([^.\/]+)$/, '')
      }
      preprocessor.run(fullPath, newFullPath, info, function (err) {
        if (err) {
          err.file = relativePath // augment
          eachCallback(err)
        } else {
          relativePath = newRelativePath
          fullPath = newFullPath
          if (oldTmpDir != null) helpers.backgroundRimraf(oldTmpDir)
          eachCallback()
        }
      })
    }, function (err) {
      if (err) {
        callback(err)
      } else {
        var fileContents = fs.readFileSync(fullPath)
        var destFilePath = self.preprocessDest + '/' + relativePath
        fs.writeFileSync(destFilePath, fileContents)
        if (tmpDir != null) helpers.backgroundRimraf(tmpDir)
        callback()
      }
    })
  }
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

Generator.prototype.cleanup = function (callback) {
  if (this.dest != null) {
    helpers.backgroundRimraf(this.dest, callback)
  } else {
    if (callback) callback()
  }
  this.dest = null
  this.preprocessDest = null
  this.compileDest = null
}

Generator.prototype.serve = function () {
  var self = this

  var watchedDirectories = this.packages.map(function (p) { return p.srcDir })
  console.log('Watching directories:')
  console.log(watchedDirectories.join('\n') + '\n')
  for (var i = 0; i < watchedDirectories.length; i++) {
    watch.watchTree(watchedDirectories[i], {
      interval: 30
    }, this.regenerate.bind(this))
  }

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


function Package (srcDir) {
  this.srcDir = srcDir
  this.preprocessors = []
}

Package.prototype.registerPreprocessor = function (preprocessor) {
  this.preprocessors.push(preprocessor)
}

function bowerPackages (bowerDir, packageOptions) {
  if (typeof bowerDir !== 'string' && packageOptions == null) {
    // bowerDir is optional
    packageOptions = bowerDir
    bowerDir = null
  }
  if (bowerDir == null) {
    bowerDir = 'bower_components'
  }
  var files = fs.readdirSync(bowerDir)
  var directories = files.filter(function (f) { return fs.statSync(bowerDir + '/' + f).isDirectory() })
  var packages = []
  for (var i = 0; i < directories.length; i++) {
    var srcDir = bowerDir + '/' + directories[i]
    var options = (packageOptions || {})[directories[i]] || {}
    if (options.assetDirs != null) {
      for (var j = 0; j < options.assetDirs.length; j++) {
        packages.push(new Package(srcDir + '/' + options.assetDirs[j]))
      }
    } else {
      packages.push(new Package(srcDir))
    }
  }
  return packages
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
      cwd: src,
      nomount: true,
      strict: true
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
}

StaticFileCompiler.prototype.run = function (src, dest, callback) {
  // Constructing globs like `{**/*.html,**/*.png}` should work reliably. If
  // not, we may need to switch to some multi-glob module.
  var combinedPattern = this.files.join(',')
  if (this.files.length > 1) {
    combinedPattern = '{' + combinedPattern + '}'
  }
  var paths = glob.sync(combinedPattern, {
    cwd: src,
    nomount: true,
    strict: true
  })
  for (var i = 0; i < paths.length; i++) {
    var srcPath = src + '/' + paths[i]
    var destPath = dest + '/' + paths[i]
    var contents = fs.readFileSync(srcPath)
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, contents)
  }
  callback()
}


var assetsPackage = new Package('assets')
assetsPackage.registerPreprocessor(new ES6TemplatePreprocessor({
  extensions: ['hbs', 'handlebars'],
  compileFunction: 'Ember.Handlebars.compile'
}))
assetsPackage.registerPreprocessor(new CoffeeScriptPreprocessor({
  options: {
    bare: true
  }
}))
assetsPackage.registerPreprocessor(new ES6TranspilerPreprocessor)

var vendorPackage = new Package('vendor')

var bowerPackages = bowerPackages({
  'ember-resolver': {
    assetDirs: ['dist']
  }
})

var generator = new Generator({
  packages: [assetsPackage, vendorPackage].concat(bowerPackages)
})
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
