import path from 'path';
import findup from 'findup-sync';
import esm from 'esm';

interface LoadBrocfileOptions {
  brocfilePath?: string;
  cwd?: string;
}

/**
 * Require a brocfile via either ESM or TypeScript
 *
 * @param {String} brocfilePath The path to the brocfile
 * @returns {*}
 */
function requireBrocfile(brocfilePath: string) {
  let brocfile;

  if (brocfilePath.match(/\.ts$/)) {
    try {
      require.resolve('ts-node');
    } catch {
      throw new Error(`Cannot find module 'ts-node', please install`);
    }

    try {
      require.resolve('typescript');
    } catch {
      throw new Error(`Cannot find module 'typescript', please install`);
    }

    // Register ts-node typescript compiler
    require('ts-node').register();

    // Load brocfile via ts-node
    brocfile = require(brocfilePath);
  } else {
    try {
      brocfile = require(brocfilePath);
    } catch (err) {
      // Node error when requiring an ESM file from CJS on Node <= 20
      if (err && (err as any).code === 'ERR_REQUIRE_ESM') {
        // esm is side-effectful so only load when needed
        const esmRequire = esm(module);

        // Load brocfile via esm shim
        brocfile = esmRequire(brocfilePath);
      }
      throw err;
    }
  }

  // ESM `export default X` is represented as module.exports = { default: X }
  // eslint-disable-next-line no-prototype-builtins
  if (brocfile !== null && typeof brocfile === 'object' && brocfile.hasOwnProperty('default')) {
    brocfile = brocfile.default;
  }

  return brocfile;
}

export = function loadBrocfile(options: LoadBrocfileOptions = {}) {
  let brocfilePath;
  if (options.brocfilePath) {
    brocfilePath = path.resolve(options.brocfilePath);
  } else {
    brocfilePath = findup('Brocfile.{ts,js}', {
      nocase: true,
    });
  }

  if (!brocfilePath) {
    throw new Error('Brocfile.[js|ts] not found');
  }

  const baseDir = options.cwd || path.dirname(brocfilePath);

  // The chdir should perhaps live somewhere else and not be a side effect of
  // this function, or go away entirely
  process.chdir(baseDir);

  const brocfile = requireBrocfile(brocfilePath);

  // Brocfile should export a function, if it did, return now
  if (typeof brocfile === 'function') {
    return brocfile;
  }

  // Wrap brocfile result in a function for backwards compatibility
  return () => brocfile;
};
