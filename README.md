# Broccoli

A fast, reliable asset builder & server. Hard-coded to build Ember apps for
now, to be generalized later.

Work in progress, not really usable for anything yet.

To run, type:

```
npm install
node index.js
```

Design goals:

* Reliable: No dodgy cache invalidation or left-over files. You should never
  have to `rm -rf tmp` or restart the server.

* Fast: Rebuilding should take less than 200ms.

* Universal: Not just for JavaScript, but also for CSS, HTML, images, and
  other types of assets.

* Package manager integration: It should not matter whether files come from
  your local repository or are supplied by a package manager (like bower).
