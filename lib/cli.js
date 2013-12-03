var fs = require('fs')
var program = require('commander')

var broccoli = require('./index')
var helpers = require('./helpers')


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
  builder = helpers.loadStirfryfile()
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
  builder = helpers.loadStirfryfile()
  builder.build(outputDir, function () {
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
