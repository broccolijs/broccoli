var fs = require('fs')
var program = require('commander')
var copyDereferenceSync = require('copy-dereference').sync
var findup = require('findup-sync')

var broccoli = require('./index')

module.exports = broccoliCLI
function broccoliCLI () {
  var actionPerformed = false
  program
    .version(JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version)
    .usage('[options] <command> [<args ...>]')

  program.command('serve')
    .description('start a broccoli server')
    .option('--port <port>', 'the port to bind to [4200]', 4200)
    .option('--host <host>', 'the host to bind to [localhost]', 'localhost')
    .action(function(options) {
      actionPerformed = true
      mergeStaticOptions(options);
      broccoli.server.serve(getBuilder(), options)
    })

  program.command('build <target>')
    .description('output files to target directory')
    .action(function(outputDir) {
      actionPerformed = true
      if (fs.existsSync(outputDir)) {
        console.error(outputDir + '/ already exists; we cannot build into an existing directory')
        process.exit(1)
      }
      var builder = getBuilder()
      builder.build()
        .then(function() {
          copyDereferenceSync(builder.outputPath, outputDir)
        })
        .finally(function () {
          return builder.cleanup()
        })
        .then(function () {
          process.exit(0)
        })
        .catch(function (err) {
          // Should show file and line/col if present
          if (err.file) {
            console.error('File: ' + err.file)
          }
          console.error(err.stack)
          console.error('\nBuild failed')
          process.exit(1)
        })
    })

  program.parse(process.argv)
  if(!actionPerformed) {
    program.outputHelp()
    process.exit(1)
  }
}

function getBuilder () {
  var node = broccoli.loadBrocfile()
  return new broccoli.Builder(node)
}

/**
 * Merges command line options with any options included within
 * a JSON-formatted `.broccoli` file located in the project's
 * root directory
 * 
 * @param   {Object}  options The options passed via the CLI
 * @param   {String}  [cwd]   The current working directory to locate the `.broccoli` file
 * @return  {Object} The merged CLI and static options
 */
function mergeStaticOptions(options, cwd) {
  cwd = cwd || process.cwd();
  options = options || {};

  var brocOptionsfile = findup('.broccoli', {cwd: cwd});

  if (fs.existsSync(brocOptionsfile)) {
    var staticOptions = parseJsonFile(brocOptionsfile);
    options = Object.assign( options, staticOptions );
  }

  return options;
}

broccoliCLI.mergeStaticOptions = mergeStaticOptions

function parseJsonFile(filePath) {
  var contents = fs.readFileSync(filePath, 'utf8').toString()
  return JSON.parse( stripComments(contents) )
}

function stripComments(str) {
  return str.replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm, '').trim()
}
