# New `.rebuild` API for Broccoli Plugins

**This is a draft describing an upcoming change.**

We are replacing the original `.read`-based plugin API with a new
`.rebuild`-based API.

## Compatibility

Note: To aid with the transition, some plugins may provide both the old
`.read` API and the new `.rebuild` API at the same time.

Broccoli up to 0.13.x supports only plugins that provide the old `.read` API.
Broccoli 0.13.6 additionally throws a helpful error message if a plugin only
provides the new `.rebuild` API.

Broccoli 0.14.x and 0.15.x supports plugins that provide the old `.read` API
as well as plugins that provide the new `.rebuild` API. If a plugin provides
both APIs, Broccoli will opt to call the new `.rebuild` API.

To see deprecation warnings when plugins only support the old `.read` API, set
the BROCCOLI_WARN_READ_API=y environment variable in Broccoli >0.15.1.

Future Broccolis will support only plugins that provide the new
`.rebuild` API. If a plugin provides only the old `.read` API, Broccoli will
throw an error.

## For Plugin Authors

### Description of API Change

(Expand me; perhaps move to main README.)

* `tree.inputTrees` (set by constructor)
* `tree.inputTree` (set by constructor; alternative for single input tree)

* `tree.inputPaths` (set by Broccoli; static across builds)
* `tree.inputPath` (set by Broccoli; alternative; static across builds)
* `tree.outputPath` (set by Broccoli; static across builds)
* `tree.cachePath` (set by Broccoli; static across builds)

* `tree.rebuild()` (returns promise for null)
* `tree.cleanup()` (returns promise for null; rarely needed)

Broccoli clears outputPath.

It's OK for plugins to rmdir outputPath on rebuild and symlink it to somewhere
else.

It's OK for plugins to rimraf cachePath and re-mkdir it. (Is it?)

### Using broccoli-writer

### Using broccoli-filter

## Motivation

* Make DAG structure static (i.e. unchanging across builds) and
  discoverable before the first build.

* Make plugin API look more like broccoli-writer so that it's easier to
  understand; get rid of readTree.

* Centralize tmp dir handling.
