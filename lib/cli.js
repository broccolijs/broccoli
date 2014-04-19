var fs = require('fs')
var program = require('commander')
var RSVP = require('rsvp')
var ncp = require('ncp')
ncp.limit = 1

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
    .option('--force', 'overwrite existing files')
    .action(function(outputDir, options) {
      actionPerformed = true
      var builder = getBuilder()
      builder.build()
        .then(function (dir) {
          if (options.force) {
            deleteFolderRecursive(outputDir)
          }

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
        .finally(function () {
          builder.cleanup()
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
  var tree = broccoli.loadBrocfile()
  return new broccoli.Builder(tree)
}

// taken from http://stackoverflow.com/a/12761924/65542
function deleteFolderRecursive (path) {
  var files = []
  if( fs.existsSync(path) ) {
    files = fs.readdirSync(path)
    files.forEach(function(file, index) {
      var curPath = path + '/' + file
      if(fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath)
      } else {
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(path)
  }
}
