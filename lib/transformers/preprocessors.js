var fs = require('fs')
var path = require('path')
var glob = require('glob')
var async = require('async')
var mkdirp = require('mkdirp')
var mktemp = require('mktemp')
var rimraf = require('rimraf')
var jsStringEscape = require('js-string-escape')

var transformers = require('../transformers')
var helpers = require('../helpers')


exports.PreprocessorPipeline = PreprocessorPipeline
PreprocessorPipeline.prototype = Object.create(transformers.Transformer.prototype)
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
      var preprocessorsToApply = preprocessorsForFile(preprocessors, relativePath)
      var preprocessTmpDir = mktemp.createDirSync(path.join(self.getCacheDir(), 'preprocess-XXXXXX.tmp'))
      var i = 0
      var preprocessStageDestDir
      var currentFileName = fileName, newFileName
      var currentFullPath = fullPath, newFullPath
      async.eachSeries(preprocessorsToApply, function (preprocessor, eachCallback) {
        newFileName = preprocessor.getDestFileName(currentFileName)
        if (newFileName == null) {
          throw new Error('Unexpectedly could not find destination file path anymore for ' + currentFileName + ' using ' + preprocessor.constructor.name)
        }
        preprocessStageDestDir = path.join(preprocessTmpDir, '' + i++)
        fs.mkdirSync(preprocessStageDestDir)
        newFullPath = path.join(preprocessStageDestDir, newFileName)
        preprocessor.process(currentFullPath, newFullPath, function (err) {
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

    // Extract me, see PackageReader
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
  var extension = path.extname(fileName).replace(/^\./, '')
  if ((this.extensions || []).indexOf(extension) !== -1) {
    return fileName.slice(0, -extension.length) + this.targetExtension
  }
  return null
}


// Special pass-through preprocessor that applies when no other preprocessor
// matches
exports.CopyPreprocessor = CopyPreprocessor
CopyPreprocessor.prototype = Object.create(Preprocessor.prototype)
function CopyPreprocessor () {
  Preprocessor.apply(this, arguments)
}

CopyPreprocessor.prototype.process = function (srcFilePath, destFilePath, callback) {
  var fileContents = fs.readFileSync(srcFilePath)
  fs.writeFileSync(destFilePath, fileContents)
  callback()
}

CopyPreprocessor.prototype.getDestFileName = function (fileName) {
  return fileName
}


exports.CoffeeScriptPreprocessor = CoffeeScriptPreprocessor
CoffeeScriptPreprocessor.prototype = Object.create(Preprocessor.prototype)
function CoffeeScriptPreprocessor (options) {
  this.coffeeScriptOptions = options.coffeeScriptOptions || {}
}

CoffeeScriptPreprocessor.prototype.extensions = ['coffee']
CoffeeScriptPreprocessor.prototype.targetExtension = 'js'

CoffeeScriptPreprocessor.prototype.process = function (srcFilePath, destFilePath, callback) {
  // Copy options; https://github.com/jashkenas/coffee-script/issues/1924#issuecomment-28157026
  var optionsCopy = {}
  for (var key in this.coffeeScriptOptions) {
    if (this.coffeeScriptOptions.hasOwnProperty(key)) {
      optionsCopy[key] = this.coffeeScriptOptions[key]
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


exports.ES6TemplatePreprocessor = ES6TemplatePreprocessor
ES6TemplatePreprocessor.prototype = Object.create(Preprocessor.prototype)
function ES6TemplatePreprocessor (options) {
  this.extensions = options.extensions
  this.compileFunction = options.compileFunction || ''
}

ES6TemplatePreprocessor.prototype.targetExtension = 'js'

ES6TemplatePreprocessor.prototype.process = function (srcFilePath, destFilePath, callback) {
  var fileContents = fs.readFileSync(srcFilePath).toString()
  var moduleContents = 'export default ' + this.compileFunction +
    '("' + jsStringEscape(fileContents) + '");\n'
  fs.writeFileSync(destFilePath, moduleContents)
  callback()
}
