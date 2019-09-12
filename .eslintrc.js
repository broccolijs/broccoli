module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['node', 'prettier'],
  extends: ['eslint:recommended', 'plugin:node/recommended'],
  env: {
    node: true,
  },
  rules: {
    'no-var': 'error',
    'no-console': 'off',
    'no-process-exit': 'off',
    'object-shorthand': 'error',
    'prettier/prettier': ['error', require('./prettier.config')],
    'node/no-missing-require': ['error', {
      'tryExtensions': ['.js', '.json', '.node', '.ts'],
    }],
    'node/no-unsupported-features': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      plugins: ['mocha'],
      env: {
        mocha: true,
      },
      rules: {
        'mocha/no-exclusive-tests': 'error',
        'mocha/handle-done-callback': 'error',
      },
    },
  ],
};
