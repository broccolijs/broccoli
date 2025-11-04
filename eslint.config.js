const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const prettier = require('eslint-plugin-prettier');
const mocha = require('eslint-plugin-mocha');
const node = require('eslint-plugin-node');
const prettierConfig = require('./prettier.config');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'test/multidep/**'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
      node: node,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-var': 'error',
      'no-console': 'off',
      'no-process-exit': 'off',
      'object-shorthand': 'error',
      'prettier/prettier': ['error', prettierConfig],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**/*-test.js', 'test/**/*_test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        context: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    plugins: {
      mocha: mocha,
    },
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'mocha/no-exclusive-tests': 'error',
      'mocha/handle-done-callback': 'error',
    },
  },
];
