'use strict';

const RSVP = require('rsvp');
const TreeSync = require('tree-sync');
const childProcess = require('child_process');
const fs = require('fs');
const WatchDetector = require('watch-detector');

const broccoli = require('./index');
const messages = require('./messages');

module.exports = function broccoliCLI(args) {
  // always require a fresh commander, as it keeps state at module scope
  delete require.cache[require.resolve('commander')];
  const program = require('commander');
  let actionPromise;

  program
    .version(JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version)
    .usage('[options] <command> [<args ...>]');

  program
    .command('serve')
    .alias('s')
    .description('start a broccoli server')
    .option('--port <port>', 'the port to bind to [4200]', 4200)
    .option('--host <host>', 'the host to bind to [localhost]', 'localhost')
    .option('--brocfile-path <path>', 'the path to brocfile')
    .option('--output-path <path>', 'the path to target output folder')
    .option('--no-watch', 'turn off the watcher')
    .option('--watcher <watcher>', 'select sane watcher mode')
    .action(options => {
      const builder = getBuilder({ brocfilePath: options.brocfilePath });
      const Watcher = getWatcher(options.watch);
      const outputDir = options.outputPath;
      const watcher = new Watcher(builder, buildWatcherOptions(options));

      if (outputDir) {
        guardOutputDir(outputDir);
        const outputTree = new TreeSync(builder.outputPath, outputDir);

        watcher.on('buildSuccess', function() {
          outputTree.sync();
        });
      }

      const server = broccoli.server.serve(watcher, options.host, parseInt(options.port, 10));
      actionPromise = (server && server.closingPromise) || RSVP.resolve();
    });

  program
    .command('build [target]')
    .description('output files to target directory')
    .option('--brocfile-path <path>', 'the path to brocfile')
    .option('--output-path <path>', 'the path to target output folder')
    .option('--watch', 'turn on the watcher')
    .option('--watcher <watcher>', 'select sane watcher mode')
    .action((outputDir, options) => {
      if (outputDir && options.outputPath) {
        console.error('option --output-path and [target] cannot be passed at same time');
        process.exit(1);
      }

      if (options.outputPath) {
        outputDir = options.outputPath;
      }

      guardOutputDir(outputDir);

      const builder = getBuilder({ brocfilePath: options.brocfilePath });
      const Watcher = getWatcher(options.watch);
      const outputTree = new TreeSync(builder.outputPath, outputDir);
      const watcher = new Watcher(builder, buildWatcherOptions(options));

      watcher.on('buildSuccess', () => {
        outputTree.sync();
        messages.onBuildSuccess(builder);

        if (!options.watch) {
          watcher.quit();
        }
      });
      watcher.on('buildFailure', messages.onBuildFailure);

      function cleanupAndExit() {
        return watcher.quit();
      }

      process.on('SIGINT', cleanupAndExit);
      process.on('SIGTERM', cleanupAndExit);

      actionPromise = watcher
        .start()
        .catch(err => console.log((err && err.stack) || err))
        .finally(() => {
          builder.cleanup();
          process.exit(0);
        })
        .catch(err => {
          console.log('Cleanup error:');
          console.log((err && err.stack) || err);
          process.exit(1);
        });
    });

  program.parse(args || process.argv);

  if (!actionPromise) {
    program.outputHelp();
    process.exit(1);
  }

  return actionPromise || RSVP.resolve();
};

function getBuilder(options) {
  if (!options) {
    options = {};
  }
  return new broccoli.Builder(broccoli.loadBrocfile(options.brocfilePath));
}

function getWatcher(isWatching) {
  return isWatching ? broccoli.Watcher : require('./dummy-watcher');
}

function buildWatcherOptions(options) {
  if (!options) {
    options = {};
  }

  const detector = new WatchDetector({
    ui: { writeLine: console.log },
    childProcess,
    fs,
    watchmanSupportsPlatform: /^win/.test(process.platform),
    root: process.cwd(),
  });

  const watchPreference = detector.findBestWatcherOption({ watcher: options.watcher });
  const watcher = watchPreference.watcher;

  return {
    saneOptions: {
      poll: watcher === 'polling',
      watchman: watcher === 'watchman',
      node: watcher === 'node' || !watcher,
    },
  };
}

function guardOutputDir(outputDir) {
  if (fs.existsSync(outputDir)) {
    console.error(outputDir + '/ already exists; we cannot build into an existing directory');
    process.exit(1);
  }
}
