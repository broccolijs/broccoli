module.exports = function (broccoli) {
  var mainPackage = broccoli.helpers.loadBroccoliPackage('.') // improve API
  var bowerPackages = broccoli.readers.bowerPackages()

  var packages = [mainPackage].concat(bowerPackages)
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
