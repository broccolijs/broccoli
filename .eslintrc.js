module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 6,
  },
  extends: 'eslint:recommended',
  env: {
    node: true
  },
  rules: {
    'no-unused-vars': 'off',
    'no-console': 'off',
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
