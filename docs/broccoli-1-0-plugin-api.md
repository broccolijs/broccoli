# Transitioning to the new Broccoli 1.0 plugin API

With Broccoli 1.0, the Broccoli plugin API is changing.

If you are a Broccoli user wishing to upgrade to Broccoli 1.0, or if you are a
plugin author wishing to make your plugin compatible with Broccoli 1.0, then
this document is for you.

## Overview

The old API requires that a plugin implement a `.read` or `.rebuild` method.

The new API requires that a plugin be a subclass of
[broccoli-plugin](https://github.com/broccolijs/broccoli-plugin).

Broccoli 0.x can run plugins that use either the old or the new API.

Broccoli 1.x can only run plugins that use the new API. In return, we get new
features, such as improved error reporting and being able to control the
location of temporary directories, as well as future extensibility.

### Cosmetic changes

Along with the API change, we are making two stylistic changes in convention:
We used to call plugin instances "trees", but we now prefer calling them
"nodes" (as in "nodes in the build graph"). We also prefer using explicit
`new` to instantiate plugins.

```js
// Old convention:
var outputTree = jshintTree(inputTree);
// New convention:
var outputNode = new JSHinter(inputNode);
```

Both styles will continue to work, but we'll gradually change code and
documentation to follow the new convention.

## For Broccoli users: Upgrading to Broccoli 1.x

### Making sure all your plugins are compatible

If you are using Broccoli 0.16.5 or newer right now, set the
`BROCCOLI_WARN_READ_API` environment variable to find out whether all your
plugins are compatible with Broccoli 1.0:

```bash
BROCCOLI_WARN_READ_API=y broccoli serve
# Or, for Ember CLI users:
BROCCOLI_WARN_READ_API=y ember server
```

If you get warnings about a plugin using the deprecated `.read/.rebuild` API,
try upgrading that plugin to the latest version. If the latest version of a
plugin still isn't compatible, consider opening an issue on its GitHub repo,
or better yet, send a pull request.

### Upgrading to Broccoli 1.0

If you depend on the "broccoli" package directly, then bump the version spec
in your `package.json` like so:

```json
"broccoli": "^1.0.0-beta.2"
```

The command-line interface (`broccoli serve` and `broccoli build`) is still
the same. However, the programmatic API (`require('broccoli')`) has changed a
bit. If you are using Broccoli programmatically, refer to
[CHANGELOG.md](https://github.com/broccolijs/broccoli/blob/master/CHANGELOG.md)
to see what has changed.

Ember CLI users: Due to the changes in Broccoli's programmatic API, you cannot
use Broccoli 1.0 through the `ember` tool until Ember CLI is updated. However,
if you still want to give Broccoli 1.0 a spin right now, try using the
following hack:

```bash
npm install broccoli@^1.0.0-beta.2
echo "module.exports = require('./ember-cli-build')();" > Brocfile.js
broccoli serve
```

## For plugin authors: Updating your plugin to use the new API

Updating your plugin will make it ready for Broccoli 1.x without breaking
backwards compatibility with Broccoli 0.x.

### broccoli-filter

If your plugin subclasses
[broccoli-filter](https://github.com/broccolijs/broccoli-filter), upgrade to
broccoli-filter 1.0.0 or newer. Be sure to call the base class constructor as
detailed [in the README](https://github.com/broccolijs/broccoli-filter/blob/master/README.md#upgrading-from-01x-to-1x);
other than that, no changes are needed.

### broccoli-caching-writer

If your plugin subclasses
[broccoli-caching-writer](https://github.com/ember-cli/broccoli-caching-writer),
upgrade to broccoli-caching-writer 2.0.0.

With version 2.0.0, broccoli-caching-writer's API is a drop-in replacement for
broccoli-plugin. As a result, its API is completely different from
broccoli-caching-writer 0.x/1.x, and your plugin's code will need to be
updated. To do so, it's best to read the
[broccoli-plugin README](https://github.com/broccolijs/broccoli-plugin) to
familiarize yourself with the new API, while replacing all instances of
`Plugin` with `CachingWriter` in your plugin code.

As a guide, where you previously implemented

```js
MyPlugin.prototype.updateCache = function(sourcePaths, destPath) {
  // Compile from sourcePaths into destPath
}
```

you'll now want to implement

```js
MyPlugin.prototype.build = function() {
  // Compile from this.inputPaths into this.outputPath
}
```

If you always have exactly one input node, use `this.inputPaths[0]`.

### broccoli-writer or no baseclass

If your plugin subclasses
[broccoli-writer](https://github.com/broccolijs/broccoli-writer) or implements
`.read` or `.rebuild` directly without using a baseclass, subclass
[broccoli-plugin](https://github.com/broccolijs/broccoli-plugin) instead.

If you were using broccoli-writer, your implementation might have looked
something like this:

```js
var Writer = require('broccoli-writer');

MyPlugin.prototype = Object.create(Writer.prototype);
MyPlugin.prototype.constructor = MyPlugin;
function MyPlugin(inputTree) {
  this.inputTree = inputTree;
}

MyPlugin.prototype.write = function(readTree, destDir) {
  readTree(this.inputTree).then(function(srcDir) {
    // Build from srcDir to destDir
  });
};
```

With broccoli-plugin, the same plugin might be implemented like this:

```js
var Plugin = require('broccoli-plugin');

MyPlugin.prototype = Object.create(Plugin.prototype);
MyPlugin.prototype.constructor = MyPlugin;
function MyPlugin(inputNode) {
  Plugin.call(this, [inputNode]);
}

MyPlugin.prototype.build = function() {
  // Build from this.inputPaths[0] to this.outputPath
};
```

See the [broccoli-plugin](https://github.com/broccolijs/broccoli-plugin)
README for details.
