'use strict';

const promiseFinally = require('promise.prototype.finally');
const http = require('http');
const messages = require('./messages');
const middleware = require('./middleware');
const EventEmitter = require('events');

class Server extends EventEmitter {
  constructor(watcher, host, port, connect = require('connect')) {
    super();

    this._watcher = watcher;
    this._builder = watcher.builder;
    this._host = host;
    this._port = parseInt(port, 10);
    this._connect = connect;
    this._url = `http://${this._host}:${this._port}`;
    this.app = this.http = null;
    this._boundStop = this.stop.bind(this);
    this._started = false;

    if (watcher.constructor.name !== 'Watcher') {
      throw new Error('Expected Watcher instance');
    }

    if (typeof host !== 'string') {
      throw new Error('Expected host to bind to (e.g. "localhost")');
    }

    if (typeof port !== 'number' || port !== port) {
      throw new Error('Expected port to bind to (e.g. 4200)');
    }
  }

  start() {
    if (this._started) {
      throw new Error('Watcher.prototype.start() must not be called more than once');
    }

    const promise = new Promise((resolve, reject) => {
      this.app = this._connect().use(middleware(this._watcher));

      this.http = http.createServer(this.app);
      this.http.listen(this._port, this._host);

      this.http.on('listening', () => {
        console.log(`Serving on ${this._url}\n`);
        resolve(this._watcher.start());
      });

      this.http.on('error', error => {
        if (error.code !== 'EADDRINUSE') {
          throw error;
        }

        let message = `Oh snap 😫. It appears a server is already running on ${this._url}\n`;
        message += `Are you perhaps already running serve in another terminal window?\n`;
        reject(new Error(message));
      });

      process.addListener('SIGINT', this._boundStop);
      process.addListener('SIGTERM', this._boundStop);

      this._watcher.on('buildSuccess', () => {
        this.emit('buildSuccess');
        messages.onBuildSuccess(this._builder);
      });

      this._watcher.on('buildFailure', () => {
        this.emit('buildFailure');
        messages.onBuildFailure();
      });
    });

    return promiseFinally(promise, () => this.stop());
  }

  _detachListeners() {
    process.removeListener('SIGINT', this._boundStop);
    process.removeListener('SIGTERM', this._boundStop);
  }

  stop() {
    this._detachListeners();
    if (this.http) {
      this.http.close();
    }

    return this._watcher.quit().then(() => this._builder.cleanup());
  }
}

exports.serve = function serve(
  watcher,
  host,
  port,
  _connect = require('connect'),
  _process = process
) {
  const server = new Server(watcher, host, port, _connect);

  return server
    .start()
    .then(() => _process.exit(0))
    .catch(err => {
      console.log('Broccoli Cleanup error:');
      console.log((err && err.stack) || err);
      _process.exit(1);
    });
};

exports.Server = Server;
