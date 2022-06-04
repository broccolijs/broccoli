import TreeSync from 'tree-sync';
import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import CliError from './errors/cli';
import broccoli from './index';
import messages from './messages';
import ConsoleUI from '../types/console-ui';
import WatchDetector from 'watch-detector';
import UI from 'console-ui';

enum EnvironmentType {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
}

enum WatcherType {
  POLLING = 'polling',
  WATCHMAN = 'watchman',
  NODE = 'node',
}

interface ServeOptions {
  host: string;
  port: string;
  ssl: boolean;
  sslKey: string;
  sslCert: string;
  brocfilePath?: string;
  outputPath?: string;
  cwd?: string;
  noWatch?: boolean;
  watcher?: WatcherType;
  environment: EnvironmentType;
  prod?: boolean;
  dev?: boolean;

  watch: boolean; // TODO not sure if this is ever set?
}

interface BuildOptions {
  brocfilePath?: string;
  outputPath?: string;
  cwd?: string;
  watch?: boolean;
  watcher?: WatcherType;
  environment: EnvironmentType;
  prod?: boolean;
  dev?: boolean;
}

function buildBrocfileOptions(options: { environment: string }) {
  return {
    env: options.environment,
  };
}

async function getBuilder(options: { environment: string }) {
  const brocfile = broccoli.loadBrocfile(options);
  const instance = await Promise.resolve(brocfile(buildBrocfileOptions(options)));
  return new broccoli.Builder(instance);
}

function getWatcher(options: { watch?: boolean }) {
  return options.watch ? broccoli.Watcher : require('./dummy-watcher');
}

function buildWatcherOptions(options: { watcher?: string }, ui: ConsoleUI) {
  if (!options) {
    options = {};
  }

  const detector = new WatchDetector({
    ui,
    childProcess,
    fs,
    watchmanSupportsPlatform: /^win/.test(process.platform),
    root: process.cwd(),
  });

  const watchPreference = detector.findBestWatcherOption({
    watcher: options.watcher,
  });
  const watcher = watchPreference.watcher;

  return {
    saneOptions: {
      poll: watcher === WatcherType.POLLING,
      watchman: watcher === WatcherType.WATCHMAN,
      node: watcher === WatcherType.NODE || !watcher,
    },
  };
}

function isParentDirectory(outputPath: string) {
  if (!fs.existsSync(outputPath)) {
    return false;
  }

  outputPath = fs.realpathSync(outputPath);

  const rootPath = process.cwd();
  const rootPathParents = [rootPath];
  let dir = path.dirname(rootPath);
  rootPathParents.push(dir);

  while (dir !== path.dirname(dir)) {
    dir = path.dirname(dir);
    rootPathParents.push(dir);
  }

  return rootPathParents.indexOf(outputPath) !== -1;
}

function guardOutputDir(outputDir: string) {
  if (isParentDirectory(outputDir)) {
    throw new CliError(
      `build directory can not be the current or direct parent directory: ${outputDir}`
    );
  }
}

export = function broccoliCLI(args: string[], ui = new UI()) {
  // always require a fresh commander, as it keeps state at module scope
  delete require.cache[require.resolve('commander')];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const program = require('commander');
  let actionPromise;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  program.version(require('../package.json').version).usage('<command> [options] [<args ...>]');

  program
    .command('serve')
    .alias('s')
    .description('start a broccoli server')
    .option('--port <port>', 'the port to bind to [4200]', 4200)
    .option('--host <host>', 'the host to bind to [localhost]', 'localhost')
    .option('--ssl', 'serve via HTTPS', false)
    .option('--ssl-key <path>', 'path to SSL key file [ssl/server.key]', 'ssl/server.key')
    .option('--ssl-cert <path>', 'path to SSL cert file [ssl/server.crt]', 'ssl/server.crt')
    .option('--brocfile-path <path>', 'the path to brocfile')
    .option('--output-path <path>', 'the path to target output folder')
    .option('--cwd <path>', 'the path to working folder')
    .option('--no-watch', 'turn off the watcher')
    .option('--watcher <watcher>', 'select sane watcher mode')
    .option('-e, --environment <environment>', 'build environment [development]', 'development')
    .option('--prod', 'alias for --environment=production')
    .option('--dev', 'alias for --environment=development')
    .action(async (options: ServeOptions) => {
      if (options.prod) {
        options.environment = EnvironmentType.PRODUCTION;
      } else if (options.dev) {
        options.environment = EnvironmentType.DEVELOPMENT;
      }

      const builder = await getBuilder(options);
      const Watcher = getWatcher(options);
      const outputDir = options.outputPath;
      const watcher = new Watcher(
        builder,
        builder.watchedSourceNodeWrappers,
        buildWatcherOptions(options, ui)
      );

      if (outputDir) {
        try {
          guardOutputDir(outputDir);
        } catch (e) {
          if (e instanceof CliError) {
            ui.writeError(e);
            return process.exit(1);
          }

          throw e;
        }

        const outputTree = new TreeSync(builder.outputPath, outputDir);

        watcher.on('buildSuccess', () => outputTree.sync());
      }

      actionPromise = broccoli.server.serve(
        watcher,
        options.host,
        parseInt(options.port, 10),
        undefined,
        undefined,
        ui,
        options.ssl,
        options.sslKey,
        options.sslCert
      );
    });

  program
    .command('build [target]')
    .alias('b')
    .description('output files to target directory')
    .option('--brocfile-path <path>', 'the path to brocfile')
    .option('--output-path <path>', 'the path to target output folder')
    .option('--cwd <path>', 'the path to working folder')
    .option('--watch', 'turn on the watcher')
    .option('--watcher <watcher>', 'select sane watcher mode')
    .option('-e, --environment <environment>', 'build environment [development]', 'development')
    .option('--prod', 'alias for --environment=production')
    .option('--dev', 'alias for --environment=development')
    .action(async (outputDir: string, options: BuildOptions) => {
      if (outputDir && options.outputPath) {
        ui.writeLine('option --output-path and [target] cannot be passed at same time', 'ERROR');
        return process.exit(1);
      }

      if (options.outputPath) {
        outputDir = options.outputPath;
      }

      if (!outputDir) {
        outputDir = 'dist';
      }

      if (options.prod) {
        options.environment = EnvironmentType.PRODUCTION;
      } else if (options.dev) {
        options.environment = EnvironmentType.DEVELOPMENT;
      }

      try {
        guardOutputDir(outputDir);
      } catch (e) {
        if (e instanceof CliError) {
          ui.writeError(e);
          return process.exit(1);
        }

        throw e;
      }

      const builder = await getBuilder(options);
      const Watcher = getWatcher(options);
      const outputTree = new TreeSync(builder.outputPath, outputDir);
      const watcher = new Watcher(
        builder,
        builder.watchedSourceNodeWrappers,
        buildWatcherOptions(options, ui)
      );

      watcher.on('buildSuccess', () => {
        outputTree.sync();
        messages.onBuildSuccess(builder, ui);

        if (!options.watch) {
          watcher.quit();
        }
      });
      watcher.on('buildFailure', (err: any) => {
        ui.writeLine('build failure', 'ERROR');
        ui.writeError(err);
        if (!options.watch) {
          process.exitCode = 1;
        }
      });

      function cleanupAndExit() {
        return watcher.quit();
      }

      process.on('SIGINT', cleanupAndExit);
      process.on('SIGTERM', cleanupAndExit);

      actionPromise = (async () => {
        try {
          await watcher.start();
        } catch (e) {
          ui.writeError(e);
          process.exitCode = 1;
        } finally {
          try {
            builder.cleanup();
            if (!process.exitCode) {
              process.exitCode = 0;
            }
            process.exit(process.exitCode);
          } catch (e) {
            ui.writeLine('Cleanup error:', 'ERROR');
            ui.writeError(e);
            process.exit(1);
          }
        }
      })();
    });

  program.parse(args || process.argv);

  if (actionPromise) {
    return actionPromise;
  } else {
    program.outputHelp();
    process.exit(1);
  }
};
