'use strict';

const path = require('path');
const findup = require('findup-sync');

module.exports = function loadBrocfile(options) {
  if (!options) {
    options = {};
  }

  let brocfile;

  if (options.brocfilePath) {
    brocfile = path.resolve(options.brocfilePath);
  } else {
    brocfile = findup('Brocfile.js', {
      nocase: true,
    });
  }

  if (!brocfile) {
    throw new Error('Brocfile.js not found');
  }

  const baseDir = options.cwd || path.dirname(brocfile);

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir);

  return require(brocfile);
};
