# Broccoli

[![Build Status](https://travis-ci.org/joliss/broccoli.png?branch=master)](https://travis-ci.org/joliss/broccoli)

A fast, reliable asset builder & server. Like Sprockets, but better
architected and not tied to Rails.

For the command line interface, see [broccoli-cli](https://github.com/joliss/broccoli-cli).

For a sample app, see [joliss/ember-app-kit#broccoli](https://github.com/joliss/ember-app-kit/tree/broccoli).

**This is pre-alpha work-in-progress. It's not usable for building actual JavaScript applications yet.**

Windows is not yet supported.

Design goals:

* Reliable: No dodgy cache invalidation or left-over files. You should never
  have to `rm -rf tmp` or restart the server.

* Fast: Rebuilding should take less than 200ms.

* Universal: Not just for JavaScript, but also for CSS, HTML, images, and
  other types of assets.

* Package manager integration: It should not matter whether files come from
  your local repository or are supplied by a package manager (like bower).
