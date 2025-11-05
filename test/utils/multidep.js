process.title = 'multidep';

if (process.argv.length !== 3) {
  console.error('Usage: multidep path/to/spec.json');
  process.exit(1);
}

require('./multidep/index')
  .install(process.argv[2])
  .catch(function (err) {
    console.error(err.stack || err);
    process.exit(1);
  });
