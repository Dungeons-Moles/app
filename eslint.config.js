const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: ['node_modules/', '.expo/', 'dist/', 'build/', 'web-build/'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Uint8Array: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // TypeScript recommended rules
      ...typescriptEslint.configs.recommended.rules,

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // TypeScript customizations
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',

      // General rules
      'no-console': 'off',
      'no-debugger': 'warn',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];
