var fs = require('fs')
var program = require('commander')
var synchronized = require('synchronized')

var broccoli = require('./index')


var assetsPackage = new broccoli.packages.Package('assets')
assetsPackage.registerPreprocessor(new broccoli.preprocessors.ES6TemplatePreprocessor({
  extensions: ['hbs', 'handlebars'],
  compileFunction: 'Ember.Handlebars.compile'
}))
assetsPackage.registerPreprocessor(new broccoli.preprocessors.CoffeeScriptPreprocessor({
  options: {
    bare: true
  }
}))
assetsPackage.registerPreprocessor(new broccoli.preprocessors.ES6TranspilerPreprocessor)

var vendorPackage = new broccoli.packages.Package('vendor')

var bowerPackages = broccoli.packages.bowerPackages()

var generator = new broccoli.Generator({
  packages: [assetsPackage, vendorPackage].concat(bowerPackages)
})
generator.registerCompiler(new broccoli.compilers.JavaScriptConcatenatorCompiler({
  files: [
    'jquery.js',
    'almond.js',
    'handlebars.js',
    'ember.js',
    'ember-data.js',
    'ember-resolver.js',
    'appkit/**/*.js']
}))
generator.registerCompiler(new broccoli.compilers.StaticFileCompiler({
  files: ['index.html']
}))


program
  .usage('[options] <command> [<args ...>]')
  .on('--help', function () {
    console.log('  Available commands:')
    console.log()
    console.log('    serve')
    console.log('    build <output-dir>')
    console.log()
  })
  .parse(process.argv)

var command = program.args.shift()

if (command === 'serve') {
  if (program.args.length !== 0) program.help()
  broccoli.server.serve(generator)
} else if (command === 'build') {
  if (program.args.length !== 1) program.help()
  var outputDir = program.args.shift()
  try {
    fs.mkdirSync(outputDir)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    console.error('Error: Directory "' + outputDir + '" already exists. Refusing to overwrite files.')
    process.exit(1)
  }
  generator.regenerate(outputDir, function () {
    if (generator.buildError) {
      // We should report this nicely
      console.error('Some error occurred; use "serve" to see the error message :/')
      generator.cleanupAllAndExit(1)
    } else {
      generator.cleanupAllAndExit()
    }
  })
} else {
  program.help()
}
