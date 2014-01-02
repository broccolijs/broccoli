# Broccoli

[![Build Status](https://travis-ci.org/joliss/broccoli.png?branch=master)](https://travis-ci.org/joliss/broccoli)
[![Analytics](https://ga-beacon.appspot.com/UA-46801091-1/broccoli/README.md?pixel)](https://github.com/igrigorik/ga-beacon)

A fast, reliable asset pipeline, supporting constant-time rebuilds. Like
Sprockets, but with more modern architecture and not tied to Rails.

For the command line interface, see [broccoli-cli](https://github.com/joliss/broccoli-cli).

For a sample app, see [joliss/ember-app-kit#broccoli](https://github.com/joliss/ember-app-kit/tree/broccoli).

**This is pre-alpha work-in-progress. It's not usable for building actual JavaScript applications yet.**

Windows is not yet supported.

## Design goals

* Reliable: No dodgy cache invalidation or left-over files. You should never
  have to `rm -rf tmp` or restart the server.

* Fast: Rebuilding should be O(1) and take less than 200ms.

* Universal: Not just for JavaScript, but also for CSS, HTML, images, and
  other types of assets.

* Package manager integration: It should not matter whether files come from
  your local repository or are supplied by a package manager (like bower).

## Broccolifile.js and Stirfryfile.js

Every package -- your app itself as well as each of its dependencies -- has a
Broccolifile.js. The Broccolifile.js defines where source files live, and
whether to apply preprocessors that other packages should not have to know
about, such as CoffeeScript.

When you build your app, all the broccolis are compiled and concatenated as
defined by the Stirfryfile.js. In other words, the Stirfryfile.js code applies
not just to your app code but also to all its dependencies. For instance, Sass
would be invoked in the Stirfryfile.js.

When you push a package to bower, its Stirfryfile.js is ignored. Only the
Broccolifile.js defines the external interface that gets exported to other
packages.
