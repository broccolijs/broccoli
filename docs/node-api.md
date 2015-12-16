# The Broccoli Node API

This document describes the API used to communicate between the Broccoli core (the
`Builder`) and individual nodes. It is aimed at developers looking to add
features to Broccoli, or looking to write libraries that interact with or wrap
arbitrary Broccoli nodes.

If you are simply trying to write a plugin, check the [broccoli-plugin
README](https://github.com/broccolijs/broccoli-plugin) instead. You are
unlikely to come into contact with the low-level API described in this
document.

Part one of this document describes the challenges that lead us to using a
versioned API. Part two is an informal specification of the node API.

## Part 1: Background: Why a versioned API

### Introduction

The build process is orchestrated by the Broccoli core package --
specifically, its Builder class. To do so, it needs to communicate with
individual *node* objects. These nodes are typically plugin instances.

This API is conceptually quite simple: Each node provides Broccoli with a list
of its input nodes and a `build` function to call on each rebuild. In turn,
Broccoli provides each node with a list of input directories corresponding to
the input nodes and an output directory.

Sometimes we want add features to the API. For example, we previously added a
`persistentOutput` flag for nodes to indicate that Broccoli should not empty
their output directories between rebuilds.

### npm makes things tricky

Let's say a plugin wants to use a new feature added in Broccoli 1.3, but an
app uses Broccoli 1.0.

With other package managers like Ruby's Bundler, a plugin could declare that
it depends on Broccoli 1.3. If this plugin was used with an app that's
running Broccoli 1.0, Bundler would then use its conflict resolution algorithm
to either upgrade Broccoli from 1.0 to 1.3 or downgrade the plugin to a
previous version that works with Broccoli 1.0. Many Ruby-based plugin
ecosystems, such as Rails, rely on this mechanism.

However, with [npm's
architecture](http://maxogden.com/nested-dependencies.html), this is not
possible. If an app uses Broccoli 1.0 and a plugin were to add an npm
dependency to Broccoli 1.3, the plugin would get a *separate* unused copy of
Broccoli 1.3, while the app would continue to use Broccoli 1.0 for building:

```
$ npm ls
my-app
├── broccoli@1.0.0
└─┬ some-broccoli-plugin
  └── broccoli@1.3.0
```

Because of this, plugins in fact don't normally declare an npm dependency on
Broccoli at all.

This leaves us with the question of how to evolve APIs in an npm-based plugin
ecosystem. This is not a theoretical concern: The maintainers of Grunt have
found it quite hard to evolve the Grunt API, and previous API changes to Grunt
have involved [much concerted
effort](http://gruntjs.com/upgrading-from-0.3-to-0.4).

### Versioning the API

With Broccoli, we choose to address this problem by versioning the API. The
Broccoli Builder and every node declares which version of the API it is
"speaking".

This allows us to implement most API changes with full backward *and* forward
compatibility, so that every Broccoli version works with every plugin version:

* When a new Broccoli version encounters an older plugin, it uses the plugin's
  older API dialect

* When a new plugin encounters an old version of the Broccoli Builder, it uses
  the Builder's older API dialect

The second point might seem surprising: It would at first seem excessive to
keep compatibility in such a way that plugins can never require a Broccoli
version newer than 1.0. In fact, there's nothing stopping us from throwing an
error message saying, "this plugin requires Broccoli 1.3 or newer." However
we've found that in most cases, it's possible to ship a small compatibility
layer so that plugins still work with older Broccoli versions (perhaps with
reduced performance). This is usually less work than documenting the breakage
and getting people to upgrade.

### Isolating plugin authors from API versioning

We want to isolate plugin authors from the complexity of dealing with multiple
API versions. They should only have to deal with a fixed API, which is both
easier and less error-prone.

To this end, we provide the
[broccoli-plugin](https://github.com/broccolijs/broccoli-plugin) base class,
from which nearly all plugins derive. It includes compatibility code to work
with old Broccoli versions. A given broccoli-plugin version exposes a fixed
interface to plugin authors regardless of which Broccoli version the plugin
ends up running on. For example, here is how a hypothetical
"broccoli-fooscript" plugin would communicate with Broccoli:

```
                            +------------------------+
                            |                        |
                            |   broccoli-fooscript   |
                       +----+                        |
                       |    +-----------+------------+
                       |                |
npm dependency:        |                | broccoli-plugin base class interface (simple),
broccoli-plugin ^1.2.3 |                | described in the broccoli-plugin README
                       |                |
                       |    +-----------+------------+
                       +---->                        |
                            | broccoli-plugin 1.2.3  |
                            |                        |
                            +-----------+------------+
                                        |
(no npm dependency here)                | Broccoli node API (versioned, complex),
                                        | described in this document
                                        |
                            +-----------+------------+
                            |                        |
                            |   broccoli (Builder)   |
                            |                        |
                            +------------------------+
```

So why do we go through broccoli-plugin as a layer of indirection, rather than
exposing its API directly from Broccoli? There's two reasons:

First, recall that broccoli-plugin contains a bunch of compatibility code that
gets activated depending on the Broccoli version.

Second, having a broccoli-plugin base class allows us to make incompatible
changes to the broccoli-plugin interface: If we change our mind about some
part of the interface, we can simply redo it and release broccoli-plugin 2.0.
If broccoli-fooscript uses broccoli-plugin 1.2.3, and a newer plugin
broccoli-barscript uses broccoli-plugin 2.0.0, they can both coexist in a
single application. Both will, under the hood, use the same node API to
communicate with Broccoli. In other words, we are now playing to npm's
strengths:

```
$ npm ls
my-app
├── broccoli
├─┬ broccoli-fooscript
│ └── broccoli-plugin@1.2.3
└─┬ broccoli-barscript
  └── broccoli-plugin@2.0.0
```

## Part 2: Node API specification

Every API version is represented by a set of feature flags. We use feature
flags instead of plain numbers to allow parallel development of new features
on branches. Feature flags cannot be combined independently, however, so it's
best to think of a given set of feature flags as simply a more-descriptive
version number.

Every node must have two special properties:

* `node.__broccoliFeatures__`: the node's feature set, indicating the API version

* `node.__broccoliGetInfo__: function(builderFeatures) { /* return nodeInfo */ }`:
  a function to be called by the `Builder`, taking the builder's feature set
  as an argument and returning a `nodeInfo` object, described below

The double underscores are meant to indicate magicness, not privateness. In
fact, these two properties are a node's *only* public API that you should rely
on.

The Builder must check every node's feature set (`node.__broccoliFeatures__`).
If the node's feature set is older than the Builder's feature set, the Builder
shall interpret the node's `nodeInfo` according to the node's older API
specification.

The node, conversely, must check the Builder's feature set
(`builderFeatures`). If the Builder's feature set is older than the node's
feature set, the node shall return a `nodeInfo` object according to the
Builder's older API specification.

The `node.__broccoliGetInfo__` function may be called multiple times, so it
should be side-effect free.

### Version 3 (current)

Feature set (`node.__broccoliFeatures__` and `builderFeatures`):

```js
{
  persistentOutputFlag: true,
  sourceDirectories: true
}
```

The `nodeInfo` object returned by `node.__broccoliGetInfo__` has a
`nodeInfo.nodeType` property, which must be either `'transform'` or
`'source'`. This property determines what other properties are present:

* "Transform" nodes are used to transform a set of zero or more input
  directories (often exactly one) into an output directory, for example
  by a compiler. Their `nodeInfo` objects have the following properties:

    * `nodeInfo.nodeType` {string}:
      `'transform'`

    * `nodeInfo.inputNodes` {Array}:
      Zero or more Broccoli nodes to be used as input to this node.

    * `nodeInfo.setup` {`function(inputPaths, outputPath, cachePath)`, no
      return value}:
      The Builder will call this function once before the first build. This
      function will not be called more than once throughout the lifetime of
      the node.

        * `inputPath` {Array}:
          An array of paths corresponding to `nodeInfo.inputNodes`. When
          building, the node may read from these paths, but most never write
          to them.
        * `outputPath` {string}:
          A path to an empty directory for the node to write its output to
          when building.

        * `cachePath` {string}:
          A path to an empty directory for the node to store files it wants to
          keep around between builds. This directory will only be deleted when
          the Broccoli process terminates (for example, when the Broccoli
          server is restarted).

    * `nodeInfo.getCallbackObject` {`function()`, returns an object}:
      The Builder will call this function once after it has called `setup`.
      This function will not be called more than once throughout the lifetime
      of the node. The object returned must have a `build` property, which is
      the function that the builder will call on each rebuild:

      ```js
      var callbackObject = nodeInfo.getCallbackObject()
      // For each rebuild:
      callbackObject.build() // => promise
      ```

      Properties other than `.build` will be ignored.

      The `build` function is responsible for performing the node's main work.
      It may throw an exception, which will be reported as a build error by
      Broccoli. If the `build` function performs asynchronous work, it must
      return a promise that is resolved on completion of the asynchronous
      work, or rejected if there is an error. Return values other than
      promises are ignored.

    * `nodeInfo.persistentOutput` {boolean}:
      If `false`, then between rebuilds, the Builder will delete the
      `outputPath` directory recursively and recreate it as an empty
      directory. If `true`, the Builder will do nothing.

      Note that just like `cachePath`, the `outputPath` directory will not
      persist between Broccoli server restarts or `broccoli build` invocations
      even if `persistentOutput` is true.

    * `nodeInfo.name` {string}:
      The name of the plugin that this node is an instance of. Example:
      `'BroccoliMergeTrees'`

    * `nodeInfo.annotation` {string or null/undefined}:
      A description of this particular node. Useful to tell multiple instances
      of the same plugin apart during debugging. Example: `'vendor
      directories'`

    * `nodeInfo.instantiationStack` {string}:
      A stack trace generated when the node constructor ran. Useful for
      telling where a given node was instantiated during debugging.
      This is `(new Error).stack` without the first line.

* "Source" nodes describe source directories on disk. Their `nodeInfo`
  objects have the following properties:

    * `nodeInfo.nodeType` {string}:
      `'source'`

    * `nodeInfo.sourceDirectory` {string}:
      A path to an existing directory on disk, relative to the current working
      directory.

    * `nodeInfo.watched` {boolean}:
      If `false`, changed files in the `sourceDirectory` will not trigger
      rebuilds (though they might still be picked up by subsequent rebuilds).
      If `true`, instructs the Broccoli file system watcher to watch the
      `sourceDirectory` recursively and trigger a rebuild whenever a file
      changes.

      Setting this to `false` is useful to improve performance for large
      vendor directories that are unlikely to change.

    * `nodeInfo.name` {string}:
      The name of the plugin that this node is an instance of.

    * `nodeInfo.annotation` {string or null/undefined}:
      A description to help with debugging.

    * `nodeInfo.instantiationStack` {string}:
      A stack trace generated when the node constructor ran.

### Version 2

Feature set (`node.__broccoliFeatures__` and `builderFeatures`):

```js
{
  persistentOutputFlag: true
}
```

Differences to version 3: The `nodeInfo.nodeType` property is absent. "Source"
nodes are not allowed; all nodes are implicitly of type "transform".

### Version 1

Feature set (`node.__broccoliFeatures__` and `builderFeatures`):

```js
{
}
```

Differences to version 2: The `nodeInfo.persistentOutput` property is absent.
It is always treated as `false`.

### Special case: string nodes

For historical reasons, we support plain strings as nodes. These act like
watched "source" nodes. For new projects, we recommend that you use
[broccoli-source](https://github.com/broccolijs/broccoli-source) instead, as
it greatly improves the debugging experience.

## Further reading

* [broccoli: lib/builder.js](https://github.com/broccolijs/broccoli/blob/master/lib/builder.js)
* [broccoli-plugin: index.js](https://github.com/broccolijs/broccoli-plugin/blob/master/index.js)
  ("transform" nodes)
* [broccoli-source: index.js](https://github.com/broccolijs/broccoli-source/blob/master/index.js)
  ("source" nodes)
