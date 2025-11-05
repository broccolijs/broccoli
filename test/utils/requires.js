require('ts-node/register');
require('longjohn');
process.on('unhandledRejection', (reason) => {
  throw reason;
});
