var fs = require('fs')
var program = require('commander')
var copyDereferenceSync = require('copy-dereference').sync

var broccoli = require('./index')
var Watcher = require('./watcher')


module.exports = broccoliCLI
function broccoliCLI (args) {
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
      broccoli.server.serve(new Watcher(getBuilder()), options.host, parseInt(options.port, 10))
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

  program.parse(args || process.argv)
  if(!actionPerformed) {
    program.outputHelp()
    process.exit(1)
  }
}

function getBuilder () {
  var node = broccoli.loadBrocfile()
  return new broccoli.Builder(node)
}
