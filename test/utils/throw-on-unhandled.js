'use strict';

process.on('unhandledRejection', error => {
  throw error;
});
