var fs = require('fs')
var program = require('commander')
var RSVP = require('rsvp')
var ncp = require('ncp')
ncp.limit = 1

var broccoli = require('./index')
var helpers = require('./helpers')


module.exports = broccoliCLI
function broccoliCLI () {
  program
    .usage('command [options] [<args ...>]')
    .option('-p, --port <n>', 'Port to run the server on. Default: 8080', parseInt, 8080)
    .option('-h, --host <host>', 'The host to run the server on. Default: 0.0.0.0', '0.0.0.0');
  program.command('serve [options]')
    .description('Runs the built in server.');
  program.command('build <output-dir>')
    .description('Precompile assets.');
  program.parse(process.argv);

  var command = program.args.shift()

  if (command === 'serve') {
    if (program.args.length !== 0) program.help()
    broccoli.server.serve(getBuilder(), {host: program.host, port: program.port})
  } else if (command === 'build') {
    if (program.args.length !== 1) program.help()
    var outputDir = program.args.shift()
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
  } else {
    program.help()
  }
}

function getBuilder () {
  var tree = helpers.loadBrocfile()
  return new broccoli.Builder(tree)
}
