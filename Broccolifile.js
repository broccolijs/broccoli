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

  var bowerPackages = broccoli.packages.bowerPackages()

  var builder = new broccoli.Builder({
    packages: [assetsPackage].concat(bowerPackages)
  })
  builder.registerCompiler(new broccoli.compilers.JavaScriptConcatenatorCompiler({
    files: [
      'jquery.js',
      'almond.js',
      'handlebars.js',
      'ember.js',
      'ember-data.js',
      'ember-resolver.js',
      'appkit/**/*.js']
  }))
  builder.registerCompiler(new broccoli.compilers.StaticFileCompiler({
    files: ['index.html']
  }))

  return builder
}
