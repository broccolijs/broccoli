var fs = require('fs')
var path = require('path')
var glob = require('glob')
var mkdirp = require('mkdirp')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var async = require('async')
var broccoli = require('./index')
var helpers = require('./helpers')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.Transformer = Transformer
__extends(Transformer, broccoli.Component)
function Transformer () {}


exports.CompilerCollection = CompilerCollection
__extends(CompilerCollection, Transformer)
function CompilerCollection (compilers) {
  this.compilers = compilers
}

CompilerCollection.prototype.run = function (srcDir, destDir, callback) {
  async.eachSeries(this.compilers, function (compiler, callback) {
    compiler.run(srcDir, destDir, function (err) {
      process.nextTick(function () { // async to avoid long stack traces
        callback(err)
      })
    })
  }, function (err) {
    callback(err)
  })
}


exports.PreprocessorCollection = PreprocessorCollection
__extends(PreprocessorCollection, Transformer)
function PreprocessorCollection (preprocessors) {
  this.preprocessors = preprocessors
}

PreprocessorCollection.prototype.run = function (srcDir, destDir, callback) {
  var self = this

  var paths = glob.sync('**', {
    cwd: srcDir,
    dot: true, // should we ignore .dotfiles?
    mark: true, // trailing slash for directories; requires additional stat calls
    strict: true
  })
  async.eachSeries(paths, function (relativePath, pathCallback) {
    var fullPath = srcDir + '/' + relativePath
    if (relativePath.slice(-1) === '/') {
      mkdirp.sync(destDir + '/' + relativePath)
      process.nextTick(pathCallback) // async to avoid long stack traces
    } else {
      processFile(fullPath, relativePath, self.preprocessors, function (err) {
        process.nextTick(function () { // async to avoid long stack traces
          pathCallback(err)
        })
      })
    }
  }, function (err) {
    callback(err)
  })

  function preprocessorsForFile (allPreprocessors, fileName) {
    allPreprocessors = allPreprocessors.slice()
    var applicablePreprocessors = []
    var destFileName
    while (allPreprocessors.length > 0) {
      var destPath, preprocessor = null
      for (var i = 0; i < allPreprocessors.length; i++) {
        destFileName = allPreprocessors[i].getDestFileName(fileName)
        if (destFileName != null) {
          preprocessor = allPreprocessors[i]
          allPreprocessors.splice(i, 1)
          break
        }
      }
      if (preprocessor != null) {
        applicablePreprocessors.push(preprocessor)
        fileName = destFileName
      } else {
        // None of the remaining preprocessors are applicable
        break
      }
    }
    if (applicablePreprocessors.length === 0) {
      applicablePreprocessors.push(new broccoli.preprocessors.CopyPreprocessor)
    }
    return applicablePreprocessors
  }

  function processFile (fullPath, relativePath, preprocessors, callback) {
    // For now, we support generating only one output file per input file, but
    // in the future we may support more (e.g. to add source maps, or to
    // convert media to multiple formats)
    var relativeDir = path.dirname(relativePath)
    var fileName = path.basename(relativePath)
    var hash = helpers.statsHash('preprocess', fullPath, fs.statSync(fullPath))
    var preprocessCacheDir = self.getCacheDir() + '/' + hash
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
      var preprocessTmpDir = mktemp.createDirSync(self.getCacheDir() + '/preprocess-XXXXXX.tmp')
      var i = 0
      var preprocessStageDestDir
      var currentFileName = fileName, newFileName
      var currentFullPath = fullPath, newFullPath
      async.eachSeries(preprocessorsToApply, function (preprocessor, eachCallback) {
        newFileName = preprocessor.getDestFileName(currentFileName)
        if (newFileName == null) {
          throw new Error('Unexpectedly could not find destination file path anymore for ' + currentFileName + ' using ' + preprocessor.constructor.name)
        }
        preprocessStageDestDir = preprocessTmpDir + '/' + i++
        fs.mkdirSync(preprocessStageDestDir)
        newFullPath = preprocessStageDestDir + '/' + newFileName
        var info = {
          moduleName: path.join(relativeDir, currentFileName.replace(/\.([^.\/]+)$/, ''))
        }
        preprocessor.run(currentFullPath, newFullPath, info, function (err) {
          if (err) {
            err.file = relativePath // augment
            eachCallback(err)
          } else {
            currentFileName = newFileName
            currentFullPath = newFullPath
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
        rimraf.sync(preprocessTmpDir)
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

    // Extract me, see PackageReader
    function linkFilesFromCache (entries) {
      for (var i = 0; i < entries.length; i++) {
        var srcFilePath = preprocessCacheDir + '/' + entries[i]
        var destFilePath = destDir + '/' + relativeDir + '/' + entries[i]
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
