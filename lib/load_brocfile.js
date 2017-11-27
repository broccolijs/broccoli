'use strict';

const path = require('path');
const findup = require('findup-sync');

module.exports = loadBrocfile;
function loadBrocfile(brocfilePath) {
  let brocfile;

  if (brocfilePath) {
    brocfile = path.resolve(brocfilePath);
  } else {
    brocfile = findup('Brocfile.js', {
      nocase: true,
    });
  }

  if (brocfile == null) throw new Error('Brocfile.js not found');

  const baseDir = path.dirname(brocfile);

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir);

  const node = require(brocfile);

  return node;
}
