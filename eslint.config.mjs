import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  globalIgnores([
    '**/eslint.config.mjs',
    '**/dist/',
    '**/coverage/',
    '**/node_modules/',
    '**/jest.config.js',
    '**/test/e2e-fixtures/',
    '**/test/manual/',
  ]),
  // Test files configuration
  ...defineConfig({
    extends: compat.extends('plugin:jest/recommended', 'plugin:jest/style'),

    files: ['src/**/*.spec.ts', 'test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],

    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
      },
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }),
  // Source files configuration
  ...defineConfig([
    {
      extends: compat.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:prettier/recommended',
      ),
      files: ['src/**/*.ts', 'test/**/*.ts'],
      ignores: ['**/*.spec.ts', '**/*.e2e-spec.ts'],

      plugins: {
        '@typescript-eslint': typescriptEslint,
      },

      languageOptions: {
        globals: {
          ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',

        parserOptions: {
          project: ['./tsconfig.json', './tsconfig.test.json'],
        },
      },

      rules: {
        'prettier/prettier': [
          'error',
          {
            endOfLine: 'auto',
          },
        ],

        eqeqeq: 'error',

        'max-len': [
          'error',
          {
            code: 150,
            tabWidth: 2,
            ignoreTemplateLiterals: true,
            ignoreStrings: true,
            ignoreUrls: true,
            ignoreRegExpLiterals: true,
          },
        ],

        'no-var': 'error',
        'no-console': 'error',
        'no-promise-executor-return': 'error',
        'no-template-curly-in-string': 'error',
        'no-useless-backreference': 'error',
        'require-atomic-updates': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/no-confusing-non-null-assertion': 'error',
        '@typescript-eslint/prefer-for-of': 'error',
        '@typescript-eslint/no-unnecessary-type-constraint': 'error',
        'no-multiple-empty-lines': 'error',
        '@typescript-eslint/explicit-function-return-type': 'error',

        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
          },
        ],
      },
    },
  ]),
];
