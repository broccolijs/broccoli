# master

# 0.5.0

* Remove `broccoli.makeTree('foo')` in favor of string literals (just `'foo'`)
* Remove `broccoli.Reader`
* Add `--version` command line option

# 0.4.3

* Correct mis-publish on npm

# 0.4.2

* Preserve value/error on Watcher::current promise
* This version has been unpublished due to a mis-publish

# 0.4.1

* Extract `broccoli.helpers` into broccoli-kitchen-sink-helpers package

# 0.3.1

* Report unhandled errors in the watcher
* Add support for `.treeDir` property on error objects
* Improve watcher logic to stop double builds when build errors happen

# 0.3.0

* Bind to `localhost` instead of `0.0.0.0` (whole wide world) by default

# 0.2.6

* Overwrite mis-pushed release

# 0.2.5

* Refactor watcher logic to use promises
* Turn the hapi server into a connect middleware

# 0.2.4

* Use smaller `bower-config` package instead of `bower` to parse `bower.json`
  files

# 0.2.3

* Add `--port`, `--host`, and `--live-reload-port` options to `serve` command

# 0.2.2

* Update hapi dependency to avoid file handle leaks, causing EMFILE errors

# 0.2.1

* In addition to `Brocfile.js`, accept lowercase `brocfile.js`
* Fix error reporting for string exceptions

# 0.2.0

* Rename `Broccolifile.js` to `Brocfile.js`
* Change default port from 8000 to 4200

# 0.1.1

* Make `tree.cleanup` non-optional
* Rename `broccoli.read` to `broccoli.makeTree`

# 0.1.0

* Bump to indicate beta status
* Remove unused `helpers.walkSync` (now in node-walk-sync)

# 0.0.13

* Extract `Transformer` into `broccoli-transform` package (now "`Transform`")
* Extract `Filter` into `broccoli-filter` package

# 0.0.12

* In plugin (tree) API, replace `.afterBuild` with `.cleanup`
* Move temporary directories out of the way

# 0.0.11

* Extract `factory.env` into broccoli-env package
* Eliminate `factory` argument to Broccolifile

# 0.0.10

* Change to a `.read`-based everything-is-a-tree architecture
* Various performance improvements
* Various plugin API changes
* Add `MergedTree`
* Broccolifile may now return an array of trees, which will be merged
* Expose `broccoli.bowerTrees()`, which will hopefully be redesigned and go
  away again
* Remove `Component` base class
* Remove `CompilerCollection` and `Compiler` base class; use a `Transformer`
* Remove `Tree::addTransform`, `Tree::addTrees`, and `Tree::addBower`
* `Builder::build` now has a promise interface as well

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
