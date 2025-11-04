'use strict';

const fs = require('fs');
const path = require('path');
const execa = require('execa');
const RSVP = require('rsvp');
const { rimrafSync } = require('rimraf');

function getSpec(specPath) {
  // specPath is relative to cwd, so we need to call realpathSync
  const spec = require(fs.realpathSync(specPath));
  // eslint-disable-next-line no-prototype-builtins
  if (!spec || !spec.hasOwnProperty('path') || Array.isArray(spec.versions)) {
    throw new Error(
      'Invalid version spec; expected { path: "test/multidep_modules", versions: { ... } }, got ' +
        require('util').inspect(spec)
    );
  }
  return spec;
}

function PackageCollection() {
  // We cannot use Object.keys(this) to get the versions because we want to
  // preserve the order in which they are listed in the spec
  this.versions = [];
}

PackageCollection.prototype.forEachVersion = function(cb) {
  for (let i = 0; i < this.versions.length; i++) {
    const module = this[this.versions[i]](); // require
    cb(this.versions[i], module);
  }
};

// Check that all referenced versions referenced by the spec exist, and
// additionally pick up master versions. Return a hash of packages.
module.exports = function multidep(specPath) {
  const spec = getSpec(specPath);

  const packages = {};
  Object.keys(spec.versions)
    .sort()
    .forEach(function(packageName) {
      packages[packageName] = new PackageCollection();
      spec.versions[packageName].forEach(function(version) {
        const packagePath = path.join(spec.path, packageName + '-' + version);
        if (!fs.existsSync(packagePath)) {
          throw new Error(packagePath + ': No such file or directory. Run `multidep` to install.');
        }
        const absPath = fs.realpathSync(path.join(packagePath, 'node_modules', packageName));
        packages[packageName][version] = require.bind(global, absPath);
        packages[packageName].versions.push(version);
      });

      const masterPath = path.join(spec.path, packageName + '-master');
      if (fs.existsSync(masterPath)) {
        const absPath = fs.realpathSync(masterPath);
        packages[packageName]['master'] = require.bind(global, absPath);
        packages[packageName].versions.push('master');
      } else {
        packages[packageName]['master'] = function() {
          return null;
        };
      }
    });

  function multidepRequire(packageName, version) {
    if (packages[packageName] == null) {
      throw new Error("Package '" + packageName + "' not found in " + specPath);
    }
    const versions = packages[packageName];
    if (versions[version] == null) {
      if (version === 'master') {
        return null;
      } else {
        throw new Error(
          'Version ' + version + " of package '" + packageName + "' not found in " + specPath
        );
      }
    }
    return versions[version]();
  }

  multidepRequire.forEachVersion = function forEachVersion(packageName, cb) {
    if (packages[packageName] == null) {
      throw new Error("Package '" + packageName + "' not found in " + specPath);
    }
    packages[packageName].forEachVersion(cb);
  };

  multidepRequire.packages = packages;

  return multidepRequire;
};

module.exports.install = function(specPath) {
  const spec = getSpec(specPath);

  if (!fs.existsSync(spec.path)) {
    fs.mkdirSync(spec.path);
  }

  let promise = RSVP.resolve();
  Object.keys(spec.versions)
    .sort()
    .forEach(function(packageName) {
      spec.versions[packageName].forEach(function(version) {
        promise = promise.then(function() {
          const packagePath = path.join(spec.path, packageName + '-' + version);
          return RSVP.resolve()
            .then(async function() {
              if (!fs.existsSync(packagePath)) {
                console.log(packageName + ' ' + version + ': Installing');
                fs.mkdirSync(packagePath);
                fs.writeFileSync(
                  packagePath + '/package.json',
                  '{"name":"multidep-dummy","private":true,"description":"multidep-dummy","repository":"http://example.com","license":"MIT"}'
                );
                fs.mkdirSync(path.join(packagePath, 'node_modules'));
                await execa('npm', ['install', packageName + '@' + version], {
                  cwd: packagePath,
                  stdio: 'inherit',
                  timeout: 300000, // 5 minutes
                });
              } else {
                console.log(packageName + ' ' + version + ': Installed');
              }
            })
            .catch(function(err) {
              // We created a nested promise with `RSVP.resolve()` above so this
              // .catch clause only applies to the previous .then and doesn't
              // catch earlier failures in the chain
              rimrafSync(packagePath);
              throw err;
            });
        });
      });
    });
  return promise;
};
