var fs = require('fs')
var path = require('path')
var glob = require('glob')
var async = require('async')
var mkdirp = require('mkdirp')
var rimraf = require('rimraf')

var transformers = require('../transformers')
var helpers = require('../helpers')


exports.PreprocessorPipeline = PreprocessorPipeline
PreprocessorPipeline.prototype = Object.create(transformers.Transformer.prototype)
PreprocessorPipeline.prototype.constructor = PreprocessorPipeline
function PreprocessorPipeline () {
  this.preprocessors = []
}

PreprocessorPipeline.prototype.addPreprocessor = function (preprocessor) {
  this.preprocessors.push(preprocessor)
  return this
}

PreprocessorPipeline.prototype.transform = function (srcDir, destDir, callback) {
  var self = this

  var paths = glob.sync('**', {
    cwd: srcDir,
    dot: true, // should we ignore .dotfiles?
    mark: true, // trailing slash for directories; requires additional stat calls
    strict: true
  })
  async.eachSeries(paths, function (relativePath, pathCallback) {
    var fullPath = path.join(srcDir, relativePath)
    if (relativePath.slice(-1) === '/') {
      mkdirp.sync(path.join(destDir, relativePath))
      setImmediate(pathCallback) // async to avoid long stack traces
    } else {
      processFile(fullPath, relativePath, self.preprocessors, function (err) {
        setImmediate(function () { // async to avoid long stack traces
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
      var preprocessor = null
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
      applicablePreprocessors.push(new CopyPreprocessor)
    }
    return applicablePreprocessors
  }

  function processFile (fullPath, relativePath, preprocessors, callback) {
    // For now, we support generating only one output file per input file, but
    // in the future we may support more (e.g. to add source maps, or to
    // convert media to multiple formats)
    var relativeDir = path.dirname(relativePath)
    var fileName = path.basename(relativePath)
    var hash = helpers.hashStats(fs.statSync(fullPath), relativePath)
    var preprocessCacheDir = path.join(self.getCacheDir(), hash)
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
      var preprocessorsToApply = preprocessorsForFile(preprocessors, fileName)
      var preprocessTmpDir = self.makeTmpDir()
      var preprocessStageDestDir
      var currentFileName = fileName, newFileName
      var currentFullPath = fullPath, newFullPath
      var i = 0
      async.eachSeries(preprocessorsToApply, function (preprocessor, eachCallback) {
        newFileName = preprocessor.getDestFileName(currentFileName)
        if (newFileName == null) {
          throw new Error('Unexpectedly could not find destination file path anymore for ' + currentFileName + ' using ' + preprocessor.constructor.name)
        }
        preprocessStageDestDir = path.join(preprocessTmpDir, '' + i++)
        fs.mkdirSync(preprocessStageDestDir)
        newFullPath = path.join(preprocessStageDestDir, newFileName)
        preprocessor._processFile(currentFullPath, newFullPath, function (err) {
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
        fs.linkSync(path.join(dirPath, entries[i]), path.join(preprocessCacheDir, entries[i]))
      }
      return entries // return entries for performance
    }

    function linkFilesFromCache (entries) {
      for (var i = 0; i < entries.length; i++) {
        var srcFilePath = path.join(preprocessCacheDir, entries[i])
        var destFilePath = path.join(destDir, relativeDir, entries[i])
        try {
          fs.linkSync(srcFilePath, destFilePath)
        } catch (err) {
          if (err.code !== 'EEXIST') throw err
          fs.unlinkSync(destFilePath)
          fs.linkSync(srcFilePath, destFilePath)
        }
      }
    }
  }
}


exports.Preprocessor = Preprocessor
function Preprocessor () {}

Preprocessor.prototype.getDestFileName = function (fileName) {
  for (var i = 0; i < this.extensions.length; i++) {
    var ext = this.extensions[i]
    if (fileName.slice(-ext.length - 1) === '.' + ext) {
      if (this.targetExtension != null) {
        fileName = fileName.slice(0, -ext.length) + this.targetExtension
      }
      return fileName
    }
  }
  return null
}

Preprocessor.prototype._processFile = function (srcFilePath, destFilePath, callback) {
  var string = fs.readFileSync(srcFilePath).toString('utf8')
  this.processString(string, null, function (err, output) {
    if (err) {
      callback(err)
    } else {
      fs.writeFileSync(destFilePath, new Buffer(output, 'utf8'))
      callback()
    }
  })
}

Preprocessor.prototype.processString = function (string, info, callback) {
  throw new Error('Not implemented')
}


// Special pass-through preprocessor that applies when no other preprocessor
// matches
exports.CopyPreprocessor = CopyPreprocessor
CopyPreprocessor.prototype = Object.create(Preprocessor.prototype)
CopyPreprocessor.prototype.constructor = CopyPreprocessor
function CopyPreprocessor () {
  Preprocessor.apply(this, arguments)
}

CopyPreprocessor.prototype._processFile = function (srcFilePath, destFilePath, callback) {
  helpers.linkAndOverwrite(srcFilePath, destFilePath)
  callback()
}

CopyPreprocessor.prototype.getDestFileName = function (fileName) {
  return fileName
}
