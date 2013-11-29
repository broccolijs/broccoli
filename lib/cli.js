var fs = require('fs')
var path = require('path')
var program = require('commander')
var synchronized = require('synchronized')
var findup = require('findup-sync')

var broccoli = require('./index')


function loadBroccolifile () {
  var broccolifile = findup('Broccolifile.js')
  if (broccolifile == null) {
    throw new Error('Broccolifile.js not found')
  }
  process.chdir(path.dirname(broccolifile))
  return require(broccolifile)(broccoli)
}


program
  .usage('[options] <command> [<args ...>]')
  .on('--help', function () {
    console.log('  Available commands:')
    console.log()
    console.log('    serve')
    console.log('    build <output-dir>')
    console.log()
  })
  .parse(process.argv)

var builder
var command = program.args.shift()

if (command === 'serve') {
  if (program.args.length !== 0) program.help()
  builder = loadBroccolifile()
  broccoli.server.serve(builder)
} else if (command === 'build') {
  if (program.args.length !== 1) program.help()
  var outputDir = program.args.shift()
  try {
    fs.mkdirSync(outputDir)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    console.error('Error: Directory "' + outputDir + '" already exists. Refusing to overwrite files.')
    process.exit(1)
  }
  builder = loadBroccolifile()
  builder.regenerate(outputDir, function () {
    if (builder.buildError) {
      // We should report this nicely
      console.error('Some error occurred; use "serve" to see the error message :/')
      process.exit(1)
    } else {
      process.exit(0)
    }
  })
} else {
  program.help()
}
