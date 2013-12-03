module.exports = function (pkg, broccoli) {
  pkg.setAssetDirectory('assets')
  pkg.setTransformer(new broccoli.transformers.preprocessors.PreprocessorPipeline([
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
}
