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

var helpers = require('./helpers')
var preprocessors = require('./preprocessors')


exports.Generator = Generator
function Generator (options) {
  this.packages = options.packages
  this.preprocessors = []
  this.compilers = []

  this.dest = mktemp.createDirSync('broccoli-XXXXXX.tmp')
  this.cacheDir = this.dest + '/cache.tmp'
  fs.mkdirSync(this.cacheDir)

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

    self.cleanupBuildProducts() // remove last build's directories

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
      console.log('Regenerated ' + (err ? 'with error ' : '') + '(' + (Date.now() - startTime) + ' ms)')
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
        var possiblePreprocessors = [].concat(package.preprocessors, self.preprocessors)
        processFile(package.srcDir, path, possiblePreprocessors, function (err) {
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
    var applicablePreprocessors = []
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
        applicablePreprocessors.push(preprocessor)
        filePath = destPath
      } else {
        // None of the remaining preprocessors are applicable
        break
      }
    }
    if (applicablePreprocessors.length === 0) {
      applicablePreprocessors.push(new preprocessors.CopyPreprocessor)
    }
    return applicablePreprocessors
  }

  function processFile (srcDir, relativePath, preprocessors, callback) {
    // For now, we support generating only one output file per input file, but
    // in the future we may support more (e.g. to add source maps, or to
    // convert media to multiple formats)
    var relativeDir = path.dirname(relativePath)
    var fullPath = srcDir + '/' + relativePath
    var tmpDir = null
    var hash = helpers.statsHash('preprocess', fullPath, fs.statSync(fullPath))
    var preprocessCacheDir = self.cacheDir + '/' + hash
    var cachedFiles
    // If we have cached preprocessing output for this file, link the cached
    // file(s) in place. Else, run all the preprocessors in sequence, cache
    // the final output, and then link the cached file(s) in place.
    try {
      cachedFiles = fs.readdirSync(preprocessCacheDir)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    if (cachedFiles) {
      linkFilesFromCache(cachedFiles)
      callback()
    } else {
      runPreprocessors(function (err, cachedFiles) {
        if (err) {
          callback(err)
          return
        }
        linkFilesFromCache(cachedFiles)
        callback()
      })
    }

    function runPreprocessors (callback) {
      var preprocessorsToApply = preprocessorsForFile(preprocessors, relativePath)
      tmpDir = mktemp.createDirSync(self.dest + '/preprocess-XXXXXX.tmp')
      var i = 0
      var preprocessStageDestDir
      async.eachSeries(preprocessorsToApply, function (preprocessor, eachCallback) {
        var newRelativePath = preprocessorGetDestFilePath(preprocessor, relativePath)
        if (newRelativePath == null) {
          throw new Error('Unexpectedly could not find destination file path anymore for ' + relativePath + ' using ' + preprocessor.constructor.name)
        }
        // console.log(relativePath, '->', newRelativePath, 'using', preprocessor.constructor.name)
        preprocessStageDestDir = tmpDir + '/' + i++
        fs.mkdirSync(preprocessStageDestDir)
        var newFullPath = preprocessStageDestDir + '/' + path.basename(newRelativePath)
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
            eachCallback()
          }
        })
      }, function (err) {
        if (err) {
          callback(err)
          return
        }
        // preprocessStageDestDir is now the directory with the output from
        // the last preprocessor
        var entries = linkFilesToCache(preprocessStageDestDir)
        rimraf(tmpDir, function (err) { if (err) throw err })
        callback(null, entries)
      })
    }

    function linkFilesToCache (dirPath) {
      fs.mkdirSync(preprocessCacheDir)
      var entries = fs.readdirSync(dirPath)
      for (var i = 0; i < entries.length; i++) {
        fs.linkSync(dirPath + '/' + entries[i], preprocessCacheDir + '/' + entries[i])
      }
      return entries // return entries for performance
    }

    function linkFilesFromCache (entries) {
      for (var i = 0; i < entries.length; i++) {
        var srcFilePath = preprocessCacheDir + '/' + entries[i]
        var destFilePath = self.preprocessDest + '/' + relativeDir + '/' + entries[i]
        try {
          fs.linkSync(srcFilePath, destFilePath)
        } catch (err) {
          if (err.code !== 'EEXIST') throw err
          // console.warn('Warning: Overwriting', relativeDir + '/' + entries[i])
          fs.unlinkSync(destFilePath)
          fs.linkSync(srcFilePath, destFilePath)
        }
      }
    }
  }
}

Generator.prototype.compile = function (callback) {
  var self = this
  if (this.compileDest != null) throw new Error('self.compileDest is not null/undefined')
  this.compileDest = mktemp.createDirSync(this.dest + '/compile_dest-XXXXXX.tmp')
  async.eachSeries(self.compilers, function (compiler, callback) {
    compiler.run(self.preprocessDest, self.compileDest, function (err) {
      callback(err)
    })
  }, function (err) {
    callback(err)
  })
}

Generator.prototype.cleanupAllAndExit = function () {
  if (this.dest != null) {
    rimraf.sync(this.dest)
  }
  process.exit()
}

Generator.prototype.cleanupBuildProducts = function () {
  var self = this
  ;['preprocessDest', 'compileDest'].forEach(function (field) {
    if (self[field] != null) {
      rimraf(self[field], function (err) {
        if (err) throw err
      })
      self[field] = null
    }
  })
}

Generator.prototype.serve = function () {
  var self = this

  var watchedDirectories = this.packages.map(function (p) { return p.srcDir })
  console.log('Watching the following directories:')
  console.log(watchedDirectories.map(function (d) { return '* ' + d + '\n' }).join(''))
  for (var i = 0; i < watchedDirectories.length; i++) {
    watch.watchTree(watchedDirectories[i], {
      interval: 30
    }, this.regenerate.bind(this))
  }

  console.log('Serving on http://localhost:8000/\n')
  var server = hapi.createServer('localhost', 8000, {
    views: {
      engines: {
        html: 'handlebars'
      },
      path: __dirname + '/../templates'
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
