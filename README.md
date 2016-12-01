# Broccoli

<img src="logo/broccoli-logo.generated.png" align="right" height="150">

[![Build Status](https://travis-ci.org/broccolijs/broccoli.svg?branch=master)](https://travis-ci.org/broccolijs/broccoli)
[![Build status](https://ci.appveyor.com/api/projects/status/jd3ts93gryjeqclf/branch/master?svg=true)](https://ci.appveyor.com/project/joliss/broccoli/branch/master)

A fast, reliable asset pipeline, supporting constant-time rebuilds and compact
build definitions. Comparable to the Rails asset pipeline in scope, though it
runs on Node and is backend-agnostic. For background and architecture, see the
[introductory blog post](http://www.solitr.com/blog/2014/02/broccoli-first-release/).

For the command line interface, see
[broccoli-cli](https://github.com/broccolijs/broccoli-cli).

## Installation

```bash
npm install --save-dev broccoli
npm install --global broccoli-cli
```

## Brocfile.js

A `Brocfile.js` file in the project root contains the build specification. It
should export a tree.

A tree can be any string representing a directory path, like `'app'` or
`'src'`. Or a tree can be an object conforming to the [Plugin API
Specification](#plugin-api-specification). A `Brocfile.js` will usually
directly work with only directory paths, and then use the plugins in the
[Plugins](#plugins) section to generate transformed trees.

The following simple `Brocfile.js` would export the `app/` subdirectory as a
tree:

```js
module.exports = 'app'
```

With that Brocfile, the build result would equal the contents of the `app`
tree in your project folder. For example, say your project contains these
files:

    app
    ├─ main.js
    └─ helper.js
    Brocfile.js
    package.json
    …

Running `broccoli build the-output` (a command provided by
[broccoli-cli](https://github.com/broccolijs/broccoli-cli)) would generate
the following folder within your project folder:

    the-output
    ├─ main.js
    └─ helper.js

### Using plugins in a `Brocfile.js`

The following `Brocfile.js` exports the `app/` subdirectory as `appkit/`:

```js
var Funnel = require('broccoli-funnel')

module.exports = new Funnel('app', {
  destDir: 'appkit'
})
```

That example uses the plugin
[`broccoli-funnel`](https://www.npmjs.com/package/broccoli-funnel).
In order for the `require` call to work, you must first put the plugin in
your `devDependencies` and install it, with

    npm install --save-dev broccoli-funnel

With the above `Brocfile.js` and the file tree from the previous example,
running `broccoli build the-output` would generate the following folder:

    the-output
    └─ appkit
       ├─ main.js
       └─ helper.js

## Plugins

You can find plugins under the [broccoli-plugin keyword](https://www.npmjs.org/browse/keyword/broccoli-plugin) on npm.

### Running Broccoli, Directly or Through Other Tools

* [broccoli-timepiece](https://github.com/rjackson/broccoli-timepiece)
* [grunt-broccoli](https://github.com/embersherpa/grunt-broccoli)
* [grunt-broccoli-build](https://github.com/ericf/grunt-broccoli-build)

### Helpers

Shared code for writing plugins.

* [broccoli-plugin](https://github.com/broccolijs/broccoli-plugin)
* [broccoli-caching-writer](https://github.com/rjackson/broccoli-caching-writer)
* [broccoli-filter](https://github.com/broccolijs/broccoli-filter)

## Plugin API Specification

See [docs/node-api.md](docs/node-api.md).

Also see [docs/broccoli-1-0-plugin-api.md](docs/broccoli-1-0-plugin-api.md) on
how to upgrade from Broccoli 0.x to the Broccoli 1.x API.

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
licensed under the [MIT license](LICENSE).

The Broccoli logo was created by [Samantha Penner
(Miric)](http://mirics.deviantart.com/) and is licensed under [CC0
1.0](https://creativecommons.org/publicdomain/zero/1.0/).
