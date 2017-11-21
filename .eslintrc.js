module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 6,
  },
  plugins: ['node'],
  extends: ['eslint:recommended', 'plugin:node/recommended'],
  env: {
    node: true
  },
  rules: {
    'no-unused-vars': 'off',
    'no-console': 'off',
    'no-process-exit': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      env: {
        mocha: true,
      }
    }
  ],
};
