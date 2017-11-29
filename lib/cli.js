'use strict';

const TreeSync = require('tree-sync');
const copyDereferenceSync = require('copy-dereference').sync;
const fs = require('fs');

const broccoli = require('./index');
const Watcher = require('./watcher');

module.exports = function broccoliCLI(args) {
  // always require a fresh commander, as it keeps state at module scope
  delete require.cache[require.resolve('commander')];
  const program = require('commander');

  let actionPerformed = false;

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
    .action(options => {
      actionPerformed = true;

      const outputDir = options.outputPath;
      const builder = getBuilder({ brocfilePath: options.brocfilePath });
      const watcher = new Watcher(builder);

      if (outputDir) {
        if (fs.existsSync(outputDir)) {
          console.error(outputDir + '/ already exists; we cannot build into an existing directory');
          process.exit(1);
        }
        const outputTree = new TreeSync(builder.outputPath, outputDir);

        watcher.on('buildSuccess', function() {
          outputTree.sync();
        });
      }

      broccoli.server.serve(watcher, options.host, parseInt(options.port, 10));
    });

  program
    .command('build [target]')
    .description('output files to target directory')
    .option('--brocfile-path <path>', 'the path to brocfile')
    .option('--output-path <path>', 'the path to target output folder')
    .action((outputDir, options) => {
      actionPerformed = true;

      if (outputDir && options.outputPath) {
        console.error('option --output-path and [target] cannot be passed at same time');
        process.exit(1);
      }

      if (options.outputPath) {
        outputDir = options.outputPath;
      }

      if (fs.existsSync(outputDir)) {
        console.error(outputDir + '/ already exists; we cannot build into an existing directory');
        process.exit(1);
      }

      const builder = getBuilder({ brocfilePath: options.brocfilePath });

      builder
        .build()
        .then(() => copyDereferenceSync(builder.outputPath, outputDir))
        .finally(() => builder.cleanup())
        .then(() => process.exit(0))
        .catch(err => {
          // Should show file and line/col if present
          if (err.file) {
            console.error('File: ' + err.file);
          }
          console.error(err.stack);
          console.error('\nBuild failed');
          process.exit(1);
        });
    });

  program.parse(args || process.argv);

  if (!actionPerformed) {
    program.outputHelp();
    process.exit(1);
  }
};

function getBuilder(options) {
  if (!options) {
    options = {};
  }
  return new broccoli.Builder(broccoli.loadBrocfile(options.brocfilePath));
}
