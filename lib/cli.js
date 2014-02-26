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
    .usage('[options] <command> [<args ...>]')

  program.command("serve")
    .description("start a broccoli server")
    .action(function() {
      broccoli.server.serve(getBuilder())
    });

  program.command("build <target>")
    .description("output files to target directory")
    .action(function(outputDir) {
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
    });

  program.parse(process.argv)
}

function getBuilder () {
  var tree = helpers.loadBrocfile()
  return new broccoli.Builder(tree)
}
