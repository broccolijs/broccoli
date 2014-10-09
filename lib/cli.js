var fs = require('fs')
var program = require('commander')
var copyDereferenceSync = require('copy-dereference').sync

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
    .option('--live-reload-port <port>', 'the port to start LiveReload on [35729]', 35729)
    .action(function(options) {
      actionPerformed = true
      broccoli.server.serve(getBuilder(), options)
    })

  program.command('build <target>')
    .description('output files to target directory')
    .action(function(outputDir) {
      actionPerformed = true
      var builder = getBuilder()
      builder.build()
        .then(function (hash) {
          var dir = hash.directory
          try {
            copyDereferenceSync(dir, outputDir)
          } catch (err) {
            if (err.code === 'EEXIST') err.message += ' (we cannot build into an existing directory)'
            throw err
          }
        })
        .finally(function () {
          builder.cleanup()
        })
        .then(function () {
          process.exit(0)
        })
        .catch(function (err) {
          printErrorInfo(err);
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

function printErrorInfo(err) {
  var file
  var brocfileLocation

  // Consider deprecated .file property if present
  if (err.file) {
    console.error('error.file is deprecated.\nUse `error.broccoli = { file: ... }` instead.')
    file = err.file
  }

  if (err.broccoli && err.broccoli.file) {
    file = err.broccoli.file
  }

  // Should show file and line/col if present
  if (file) {
    console.error('File: ' + file)
  }

  // Show call stack if present
  console.error(err.stack)
}

function getBuilder () {
  var tree = broccoli.loadBrocfile()
  return new broccoli.Builder(tree)
}
