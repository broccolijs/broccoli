module.exports = function (broccoli) {
  var assetsPackage = new broccoli.readers.Package('assets', new broccoli.transformers.preprocessors.PreprocessorPipeline([
    new broccoli.transformers.preprocessors.ES6TemplatePreprocessor({
      extensions: ['hbs', 'handlebars'],
      compileFunction: 'Ember.Handlebars.compile'
    }),
    new broccoli.transformers.preprocessors.CoffeeScriptPreprocessor({
      options: {
        bare: true
      }
    })
  ]))

  var bowerPackages = broccoli.readers.bowerPackages()

  var packages = [assetsPackage].concat(bowerPackages)
  var packageReader = new broccoli.readers.PackageReader(packages)

  var compilerCollection = new broccoli.transformers.compilers.CompilerCollection({
    staticFiles: ['index.html'],
    compilers: [
      new broccoli.transformers.compilers.ES6ConcatenatorCompiler({
        loaderFile: 'almond.js', // make this a default
        ignoredModules: [
          'resolver'
        ],
        inputFiles: [
          'appkit/**/*.js'
        ],
        legacyFilesToAppend: [
          'jquery.js',
          'handlebars.js',
          'ember.js',
          'ember-data.js',
          'ember-resolver.js'
        ],
        outputFile: 'app.js'
      })
    ]
  })
  var builder = new broccoli.Builder({
    reader: packageReader,
    transformer: compilerCollection
  })

  return builder
}
