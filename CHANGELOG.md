# master

* Fold `Reader` into `Tree`
* Replace `PreprocessorPipeline` and `Preprocessor` with `Filter`; each
  `Filter` is added directly on the tree or builder with `addTransform`

# 0.0.7

* Bind to `0.0.0.0` instead of `localhost`
* Add `factory.env` based on `$BROCCOLI_ENV`
* Do not fail on invalid Cookie header
* Use promises instead of callbacks in all external APIs

# 0.0.6

* Here be dragons
