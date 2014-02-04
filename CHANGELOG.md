# master

* Show per-component timings
* Various performance improvements
* Various plugin API changes
* Added MergedTree
* Broccolifile may now return an array of trees, which will be merged
* Expose `broccoli.bowerTrees()`, which will hopefully be redesigned and go
  away again
* All component constructors get an `injector` as first argument
* Remove `Component::makeTmpDir` and `Component::getCacheDir` in favor of
  injected `TmpDirManager` and `CacheManager`
* Remove `Component` base class
* Remove timing output; this will be revived at some point

# 0.0.9

* Expect a `Tree`, not a `Builder`, returned from Broccolifile.js

# 0.0.8

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
