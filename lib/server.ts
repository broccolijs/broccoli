import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import messages from './messages';
import middleware from './middleware';
import EventEmitter from 'events';
import Watcher from './watcher';
import UI from '../types/console-ui';

class Server extends EventEmitter {
  _watcher: Watcher;
  _builder: any;
  _host: string;
  _port: number;
  _ssl: boolean;
  _sslKey: string;
  _sslCert: string;
  _connect: any;
  _url: string;
  app: null | any;
  instance: null | any | http.Server;
  _boundStop: any;
  _started: boolean;
  ui: any;

  constructor(
    watcher: Watcher,
    host: string,
    port: string,
    connect = require('connect'),
    ui: UI,
    ssl: boolean,
    sslKey: string,
    sslCert: string
  ) {
    super();

    this._watcher = watcher;
    this._builder = watcher.builder;
    this._host = host;
    this._port = parseInt(port, 10);
    this._ssl = ssl;
    this._sslKey = sslKey;
    this._sslCert = sslCert;
    this._connect = connect;
    this._url = `http${this._ssl ? 's' : ''}://${this._host}:${this._port}`;
    this.app = this.instance = null;
    this._boundStop = this.stop.bind(this);
    this._started = false;
    this.ui = ui;

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

  async start() {
    if (this._started) {
      throw new Error('Watcher.prototype.start() must not be called more than once');
    }

    const promise = new Promise((resolve, reject) => {
      this.app = this._connect().use(middleware(this._watcher));

      if (this._ssl) {
        let sslOptions;
        try {
          sslOptions = {
            key: fs.readFileSync(this._sslKey),
            cert: fs.readFileSync(this._sslCert),
          };
        } catch {
          throw new Error(
            `SSL key and certificate files should be present at ${path.join(
              process.cwd(),
              this._sslKey
            )} and ${path.join(process.cwd(), this._sslCert)} respectively.`
          );
        }

        this.instance = https.createServer(sslOptions, this.app);
      } else {
        this.instance = http.createServer(this.app);
      }

      this.instance.listen(this._port, this._host);

      this.instance.on('listening', () => {
        this.ui.writeLine(`Serving on ${this._url}\n`);
        resolve(this._watcher.start());
      });

      this.instance.on('error', (error: any) => {
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
        messages.onBuildSuccess(this._builder, this.ui);
      });

      this._watcher.on('buildFailure', (err: any) => {
        this.emit('buildFailure');
        this.ui.writeLine('build failure', 'ERROR');
        this.ui.writeError(err);
      });
    });

    try {
      await promise;
    } finally {
      await this.stop();
    }
  }

  _detachListeners() {
    process.removeListener('SIGINT', this._boundStop);
    process.removeListener('SIGTERM', this._boundStop);
  }

  async stop() {
    this._detachListeners();
    if (this.instance) {
      this.instance.close();
    }
    await this._watcher.quit();
    await this._builder.cleanup();
  }
}

function serve(
  watcher: Watcher,
  host: string,
  port: string,
  _connect = require('connect'),
  _process = process,
  ui: UI,
  ssl: boolean,
  sslKey: string,
  sslCert: string
) {
  const server = new Server(watcher, host, port, _connect, ui, ssl, sslKey, sslCert);

  return server
    .start()
    .then(() => {
      if (!_process.exitCode) {
        _process.exitCode = 0;
      }
      _process.exit(_process.exitCode);
    })
    .catch((err) => {
      ui.writeLine('Broccoli Cleanup error:', 'ERROR');
      ui.writeError(err);
      _process.exit(1);
    });
}

export = {
  Server,
  serve,
};
