'use strict';

const path = require('path');
const findup = require('findup-sync');
const esmRequire = require('esm')(module);

module.exports = function loadBrocfile(options) {
  if (!options) {
    options = {};
  }

  let brocfilePath;

  if (options.brocfilePath) {
    brocfilePath = path.resolve(options.brocfilePath);
  } else {
    brocfilePath = findup('Brocfile.js', {
      nocase: true,
    });
  }

  if (!brocfilePath) {
    throw new Error('Brocfile.js not found');
  }

  const baseDir = options.cwd || path.dirname(brocfilePath);

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir);

  // Load brocfile
  let brocfile = esmRequire(brocfilePath);

  // ESM `export default X` is represented as module.exports = { default: X }
  if (brocfile !== null && typeof brocfile === 'object' && brocfile.hasOwnProperty('default')) {
    brocfile = brocfile.default;
  }

  // Brocfile should export a function, if it did, return now
  if (typeof brocfile === 'function') {
    return brocfile;
  }

  // Wrap brocfile result in a function for backwards compatibility
  return () => brocfile;
};
