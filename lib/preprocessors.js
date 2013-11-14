var fs = require('fs')
var ES6Transpiler = require('es6-module-transpiler').Compiler
var jsStringEscape = require('js-string-escape')


// Special pass-through preprocessor that applies when no other preprocessor
// matches
exports.CopyPreprocessor = CopyPreprocessor
function CopyPreprocessor () {}

CopyPreprocessor.prototype.run = function (srcFilePath, destFilePath, info, callback) {
  var fileContents = fs.readFileSync(srcFilePath)
  fs.writeFileSync(destFilePath, fileContents)
  callback()
}

CopyPreprocessor.extensions = []
CopyPreprocessor.targetExtension = null


exports.CoffeeScriptPreprocessor = CoffeeScriptPreprocessor
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


exports.ES6TemplatePreprocessor = ES6TemplatePreprocessor
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


exports.ES6TranspilerPreprocessor = ES6TranspilerPreprocessor
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
