module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['node', 'prettier'],
  extends: ['eslint:recommended', 'plugin:node/recommended', 'plugin:@typescript-eslint/recommended'],
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
    '@typescript-eslint/ban-ts-ignore': 'off',
    'node/no-missing-import': 'off',
    'node/no-unsupported-features': 'off',
    'node/no-unsupported-features/es-syntax': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      plugins: ['mocha'],
      env: {
        mocha: true,
      },
      rules: {
        '@typescript-eslint/no-empty-function': 'off',
        'mocha/no-exclusive-tests': 'error',
        'mocha/handle-done-callback': 'error',
      },
    },
  ],
};
