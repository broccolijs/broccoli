module.exports = function (broccoli) {
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

  return generator
}
