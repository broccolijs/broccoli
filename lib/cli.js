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

var bowerPackages = broccoli.packages.bowerPackages({
  'ember-resolver': {
    assetDirs: ['dist']
  }
})

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

process.on('SIGINT', function () {
  synchronized(generator, function () {
    generator.cleanupAll(function () {
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
