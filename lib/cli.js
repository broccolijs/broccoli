var fs = require('fs')
var program = require('commander')
var RSVP = require('rsvp')
var ncp = require('ncp')
ncp.limit = 1

var broccoli = require('./index')
var helpers = require('./helpers')


module.exports = broccoliCLI
function broccoliCLI () {
  var actionPerformed = false
  program
    .usage('[options] <command> [<args ...>]')

  program.command('serve')
    .description('start a broccoli server')
    .option('--port <port>', 'the port to bind to [4200]', 4200)
    .option('--host <host>', 'the host to bind to [localhost]', 'localhost')
    .option('--live-reload-port <port>', 'the port to start LiveReload on [35729]', 35729)
    .option('--proxy <address>', 'the address of a server to proxy requests to')
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
        .then(function (dir) {
          try {
            fs.mkdirSync(outputDir)
          } catch (err) {
            if (err.code !== 'EEXIST') throw err
            console.error('Error: Directory "' + outputDir + '" already exists. Refusing to overwrite files.')
            process.exit(1)
          }
          return RSVP.denodeify(ncp)(dir, outputDir, {
            clobber: false,
            stopOnErr: true
          })
        })
        .then(function () {
          process.exit(0)
        })
        .catch(function (err) {
          // Should show file and line/col if present
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
  var tree = helpers.loadBrocfile()
  return new broccoli.Builder(tree)
}
