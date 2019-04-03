'use strict';

const promiseFinally = require('promise.prototype.finally');
const http = require('http');

const messages = require('./messages');
const middleware = require('./middleware');

exports.serve = function serve(watcher, host, port, _connect) {
  if (watcher.constructor.name !== 'Watcher') throw new Error('Expected Watcher instance');
  if (typeof host !== 'string') throw new Error('Expected host to bind to (e.g. "localhost")');
  if (typeof port !== 'number' || port !== port)
    throw new Error('Expected port to bind to (e.g. 4200)');

  let connect = arguments.length > 3 ? _connect : require('connect');

  const server = {
    onBuildSuccessful: () => messages.onBuildSuccess(watcher.builder),
    cleanupAndExit,
  };

  console.log(`Serving on http://${host}:${port}\n`);

  server.watcher = watcher;
  server.builder = server.watcher.builder;

  server.app = connect().use(middleware(server.watcher));

  server.http = http.createServer(server.app);
  server.http.listen(parseInt(port, 10), host);
  server.http.on('error', error => {
    if (error.code !== 'EADDRINUSE') {
      throw error;
    }

    let message = `Oh snap 😫. It appears a server is already running on http://${host}:${port}\n`;
    message += `Are you perhaps already running serve in another terminal window?\n`;

    console.error(message);
    process.exit(1);
  });

  // We register these so the 'exit' handler removing temp dirs is called
  function cleanupAndExit() {
    return server.watcher.quit();
  }

  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  server.watcher.on('buildSuccess', () => server.onBuildSuccessful());
  server.watcher.on('buildFailure', messages.onBuildFailure);

  server.closingPromise = promiseFinally(
    server.watcher.start().catch(err => console.log((err && err.stack) || err)),
    () => {
      server.builder.cleanup();
      server.http.close();
      process.exit(0);
    }
  ).catch(err => {
    console.log('Cleanup error:');
    console.log((err && err.stack) || err);
    process.exit(1);
  });

  return server;
};
