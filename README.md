# Broccoli

[![Build Status](https://travis-ci.org/joliss/broccoli.png?branch=master)](https://travis-ci.org/joliss/broccoli)

A fast, reliable asset pipeline, supporting constant-time rebuilds. Like
Sprockets, but with more modern architecture and not tied to Rails.

For the command line interface, see [broccoli-cli](https://github.com/joliss/broccoli-cli).

For a sample app, see [joliss/ember-app-kit#broccoli](https://github.com/joliss/ember-app-kit/tree/broccoli).
Be sure to `npm link` (symlink) the current master branch of Broccoli into
your `node_modules`, as releases are infrequent and usually out-of-date.

**This is pre-alpha work-in-progress. It's not usable for building actual JavaScript applications yet.**

Windows is not yet supported.

## Installation

```bash
npm install --save broccoli
npm install --global broccoli-cli
```

## Design goals

* Reliable: No dodgy cache invalidation or left-over files. You should never
  have to `rm -rf tmp` or restart the server.

* Fast: Rebuilding should be O(1) and take less than 200ms.

* Universal: Not just for JavaScript, but also for CSS, HTML, images, and
  other types of assets.

* Package manager integration: It should not matter whether files come from
  your local repository or are supplied by a package manager (like bower).

## Security

* Currently Broccoli binds to on `0.0.0.0`, exposing your app to the world,
  unless you use a firewall. This is what Rails does, but it still seems like
  bad practice.

* Do not run `broccoli serve` on a production server. While this is
  theoretically safe, it exposes a needlessly large amount of attack surface
  just for serving static assets. Instead, use `broccoli build` to precompile
  your assets, and serve the static files from a web server of your choice.

## License

Broccoli was originally written by [Jo Liss](http://www.solitr.com/) and is
licensed under the [MIT license](LICENSE.md).
