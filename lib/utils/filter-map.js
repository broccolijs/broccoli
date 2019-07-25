'use strict';

module.exports = function filterMap(iterator, cb) {
  const result = [];
  for (const entry of iterator) {
    if (cb(entry)) {
      result.push(entry);
    }
  }
  return result;
};
