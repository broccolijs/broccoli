# Broccoli

[![Build Status](https://travis-ci.org/joliss/broccoli.png?branch=master)](https://travis-ci.org/joliss/broccoli)

A fast, reliable asset builder & server. Hard-coded to build Ember apps for
now, to be generalized later.

**This is pre-alpha work-in-progress. It's not usable for building actual JavaScript applications yet.**

Windows is not yet supported.

For the command line interface, see [https://github.com/joliss/broccoli-cli](broccoli-cli).

For a sample app, see [https://github.com/joliss/broccoli-sample-app](broccoli-sample-app).

Design goals:

* Reliable: No dodgy cache invalidation or left-over files. You should never
  have to `rm -rf tmp` or restart the server.

* Fast: Rebuilding should take less than 200ms.

* Universal: Not just for JavaScript, but also for CSS, HTML, images, and
  other types of assets.

* Package manager integration: It should not matter whether files come from
  your local repository or are supplied by a package manager (like bower).
