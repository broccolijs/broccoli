var fs = require('fs')
var path = require('path')
var ES6Transpiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')


// CoffeeScript inheritance
var __hasProp = {}.hasOwnProperty;
var __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };


exports.Preprocessor = Preprocessor
function Preprocessor (options) {
  if (options != null) {
    for (var key in options) {
      if (options.hasOwnProperty(key)) {
        this[key] = options[key]
      }
    }
  }
}

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
__extends(CopyPreprocessor, Preprocessor)
function CopyPreprocessor () {
  CopyPreprocessor.__super__.constructor.apply(this, arguments)
}

CopyPreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath)
  fs.writeFileSync(destFilePath, fileContents)
  callback()
}

CopyPreprocessor.prototype.getDestFileName = function (fileName) {
  return fileName
}


exports.CoffeeScriptPreprocessor = CoffeeScriptPreprocessor
__extends(CoffeeScriptPreprocessor, Preprocessor)
function CoffeeScriptPreprocessor () {
  this.options = {}
  CoffeeScriptPreprocessor.__super__.constructor.apply(this, arguments)
}

CoffeeScriptPreprocessor.prototype.extensions = ['coffee']
CoffeeScriptPreprocessor.prototype.targetExtension = 'js'

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


exports.ES6TemplatePreprocessor = ES6TemplatePreprocessor
__extends(ES6TemplatePreprocessor, Preprocessor)
function ES6TemplatePreprocessor () {
  ES6TemplatePreprocessor.__super__.constructor.apply(this, arguments)
}

ES6TemplatePreprocessor.prototype.compileFunction = ''
ES6TemplatePreprocessor.prototype.extensions = [] // set when instantiating
ES6TemplatePreprocessor.prototype.targetExtension = 'js'

ES6TemplatePreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath).toString()
  var moduleContents = 'export default ' + this.compileFunction +
    '("' + jsStringEscape(fileContents) + '");\n'
  fs.writeFileSync(destFilePath, moduleContents)
  callback()
}


exports.ES6TranspilerPreprocessor = ES6TranspilerPreprocessor
__extends(ES6TranspilerPreprocessor, Preprocessor)
function ES6TranspilerPreprocessor () {
  ES6TranspilerPreprocessor.__super__.constructor.apply(this, arguments)
}

ES6TranspilerPreprocessor.prototype.extensions = ['js']
ES6TranspilerPreprocessor.prototype.targetExtension = 'js'

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
