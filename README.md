# Broccoli

[![Build Status](https://travis-ci.org/joliss/broccoli.png?branch=master)](https://travis-ci.org/joliss/broccoli)

A fast, reliable asset pipeline, supporting constant-time rebuilds and compact
build definitions. Comparable to the Rails asset pipeline in scope, though it
runs on Node and is backend-agnostic.

For the command line interface, see
[broccoli-cli](https://github.com/joliss/broccoli-cli).

**This is 0.x beta software.**

Windows is not yet supported.

## Installation

```bash
npm install --save broccoli
npm install --global broccoli-cli
```

## Getting Started

Check out
[broccoli-sample-app](https://github.com/joliss/broccoli-sample-app).

## Plugins

* [broccoli-coffee](https://github.com/joliss/broccoli-coffee)
* [broccoli-template](https://github.com/joliss/broccoli-template)
* [broccoli-static-compiler](https://github.com/joliss/broccoli-static-compiler)
* [broccoli-uglify-js](https://github.com/joliss/broccoli-uglify-js)
* [broccoli-es6-concatenator](https://github.com/joliss/broccoli-es6-concatenator)
* [broccoli-sass](https://github.com/joliss/broccoli-sass) (incomplete)

### Helpers

Shared code for writing plugins.

* [broccoli-filter](https://github.com/joliss/broccoli-filter)
* [broccoli-transform](https://github.com/joliss/broccoli-transform)
* [broccoli-env](https://github.com/joliss/broccoli-env)
* [node-quick-temp](https://github.com/joliss/node-quick-temp)

## Security

* Currently Broccoli binds to `0.0.0.0`, exposing your app to the world,
  unless you use a firewall. This is what Rails does, but it still seems like
  bad practice.

* Do not run `broccoli serve` on a production server. While this is
  theoretically safe, it exposes a needlessly large amount of attack surface
  just for serving static assets. Instead, use `broccoli build` to precompile
  your assets, and serve the static files from a web server of your choice.

## License

Broccoli was originally written by [Jo Liss](http://www.solitr.com/) and is
licensed under the [MIT license](LICENSE.md).
