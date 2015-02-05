# Broccoli

<img src="logo/broccoli-logo-small.generated.png" align="right" height="150">

[![Build Status](https://travis-ci.org/broccolijs/broccoli.svg?branch=master)](https://travis-ci.org/broccolijs/broccoli)
[![Build status](https://ci.appveyor.com/api/projects/status/jd3ts93gryjeqclf/branch/master?svg=true)](https://ci.appveyor.com/project/joliss/broccoli/branch/master)

A fast, reliable asset pipeline, supporting constant-time rebuilds and compact
build definitions. Comparable to the Rails asset pipeline in scope, though it
runs on Node and is backend-agnostic. For background and architecture, see the
[introductory blog post](http://www.solitr.com/blog/2014/02/broccoli-first-release/).

For the command line interface, see
[broccoli-cli](https://github.com/broccolijs/broccoli-cli).

**This is 0.x beta software.**

Windows support appears to still be spotty. Reports (on GitHub or IRC) about
specific failures are much appreciated -- we love collecting stack traces!

## Installation

```bash
npm install --save-dev broccoli
npm install --global broccoli-cli
```

## Getting Started

Check out
[broccoli-sample-app](https://github.com/broccolijs/broccoli-sample-app).

## Brocfile.js

A `Brocfile.js` file in the project root contains the build specification. It
should export a tree which may simply be the directory path (as a string). To
build more advanced output trees you may want to use some of the plugins listed
below.

The following would export the `app/` subdirectory as a tree:

```js
module.exports = 'app'
```

Alternatively, the following would export the `app/` subdirectory as `appkit/`:

```js
var pickFiles = require('broccoli-static-compiler')

module.exports = pickFiles('app', {
  srcDir: '/',
  destDir: 'appkit'
})
```

## Plugins

You can find plugins on [broccoliplugins.com](http://broccoliplugins.com) or under the [broccoli-plugin-keyword](https://www.npmjs.org/browse/keyword/broccoli-plugin) on npm.

### Running Broccoli, Directly or Through Other Tools

* [broccoli-timepiece](https://github.com/rjackson/broccoli-timepiece)
* [grunt-broccoli](https://github.com/quandl/grunt-broccoli)
* [grunt-broccoli-build](https://github.com/ericf/grunt-broccoli-build)

### Helpers

Shared code for writing plugins.

* [broccoli-caching-writer](https://github.com/rjackson/broccoli-caching-writer)
* [broccoli-filter](https://github.com/broccolijs/broccoli-filter)
* [broccoli-writer](https://github.com/broccolijs/broccoli-writer)
* [node-quick-temp](https://github.com/joliss/node-quick-temp)

## Plugin API Specification

Broccoli defines a single plugin API: a tree. A tree object represents a tree
(directory hierarchy) of files that can be regenerated on each build.

By convention, plugins will export a function that takes one or more input
trees, and returns an output tree object.

A tree object must supply two methods that will be called by Broccoli:

### `tree.read(readTree)`

The `.read` method must return a path or a promise for a path, containing the
tree contents.

It receives a `readTree` function argument from Broccoli. If `.read` needs to
read other trees, it must not call `otherTree.read` directly. Instead, it must
call `readTree(otherTree)`, which returns a promise for the path containing
`otherTree`'s contents. It must not call `readTree` again until the promise
has resolved; that is, it cannot call `readTree` on multiple trees in
parallel.

Broccoli will call the `.read` method repeatedly to rebuild the tree, but at
most once per rebuild; that is, if a tree is used multiple times in a build
definition, Broccoli will reuse the path returned instead of calling `.read`
again.

The `.read` method is responsible for creating a new temporary directory to
store the tree contents in. Subsequent invocations of `.read` should remove
temporary directories created in previous invocations.

### `tree.cleanup()`

For every tree whose `.read` method was called one or more times, the
`.cleanup` method will be called exactly once. No further `.read` calls will
follow `.cleanup`. The `.cleanup` method should remove all temporary
directories created by `.read`.

### Debugging


#### Errors

When it is known which file caused a given error, plugin authors can make errors
easier to track down by setting the `.file` property on the generated error.

This `.file` property is used by both the console logging, and the server middleware
to display more helpful error messages.

#### Descriptive Naming

As of 0.11 Broccoli prints a log of any trees that took a significant amount of the total
build time to assist in finding which trees are consuming the largest build times.

To determine the name to be printed Broccoli will first look for a `.description`
property on the plugin instance then fall back to using the plugin constructor's name.

## Security

* Do not run `broccoli serve` on a production server. While this is
  theoretically safe, it exposes a needlessly large amount of attack surface
  just for serving static assets. Instead, use `broccoli build` to precompile
  your assets, and serve the static files from a web server of your choice.

## Get Help

* IRC: `#broccolijs` on Freenode. Ask your question and stick around for a few
  hours. Someone will see your message eventually.
* Twitter: mention @jo_liss with your question
* GitHub: Open an issue on a specific plugin repository, or on this
  repository for general questions.

## License

Broccoli was originally written by [Jo Liss](http://www.solitr.com/) and is
licensed under the [MIT license](LICENSE.md).

The Broccoli logo was created by [Samantha Penner
(Miric)](http://mirics.deviantart.com/) and is licensed under [CC0
1.0](https://creativecommons.org/publicdomain/zero/1.0/).
