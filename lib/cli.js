var fs = require('fs')
var program = require('commander')
var broccoli = require('./index')

module.exports = broccoliCLI
function broccoliCLI () {
  var actionPerformed = false
  program
    .version(JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8')).version)
    .usage('[options] <command> [<args ...>]')

  program.command('serve [target]')
    .description('start a broccoli server')
    .option('--port <port>', 'the port to bind to [4200]', 4200)
    .option('--host <host>', 'the host to bind to [localhost]', 'localhost')
    .action(function(outputDir, options) {
      actionPerformed = true
      checkOutputDir(outputDir)
      broccoli.server.serve(getBuilder({ outputDir: outputDir }), options)
    })

  program.command('build <target>')
    .description('output files to target directory')
    .action(function(outputDir) {
      actionPerformed = true
      checkOutputDir(outputDir)
      var builder = getBuilder({ outputDir: outputDir })
      builder.build()
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

function checkOutputDir(outputDir) {
  if (fs.existsSync(outputDir)) {
    console.error(outputDir + '/ already exists; we cannot build into an existing directory')
    process.exit(1)
  }
}

function getBuilder (options) {
  var node = broccoli.loadBrocfile()
  return new broccoli.Builder(node, options)
}
