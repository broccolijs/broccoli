module.exports = function (broccoli) {
  var assetsPackage = new broccoli.packages.Package('assets', new broccoli.treeTransforms.PreprocessorCollection([
    new broccoli.preprocessors.ES6TemplatePreprocessor({
      extensions: ['hbs', 'handlebars'],
      compileFunction: 'Ember.Handlebars.compile'
    }),
    new broccoli.preprocessors.CoffeeScriptPreprocessor({
      options: {
        bare: true
      }
    }),
    new broccoli.preprocessors.ES6TranspilerPreprocessor
  ]))

  var bowerPackages = broccoli.packages.bowerPackages()

  var packages = [assetsPackage].concat(bowerPackages)
  var packageReader = new broccoli.readers.PackageReader(packages)

  var compilerCollection = new broccoli.treeTransforms.CompilerCollection([
    new broccoli.compilers.JavaScriptConcatenatorCompiler({
      files: [
        'jquery.js',
        'almond.js',
        'handlebars.js',
        'ember.js',
        'ember-data.js',
        'ember-resolver.js',
        'appkit/**/*.js']
    }),
    new broccoli.compilers.StaticFileCompiler({
      files: ['index.html']
    })
  ])
  var builder = new broccoli.Builder({
    reader: packageReader,
    compilerCollection: compilerCollection
  })

  return builder
}
