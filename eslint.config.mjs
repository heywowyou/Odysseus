// @ts-check

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,ts,tsx,mts}'];

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    'artifacts/**',
    'data/**',
    'reports/**',
    'docs/report/design/**',
    // Agent skill trees are vendored by external installers, never maintained
    // source; the same policy .prettierignore applies to them.
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.impeccable/**',
  ]),
  {
    files: sourceFiles,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // These patterns are deliberate in sanitizers and reviewed product copy.
      'no-control-regex': 'off',
      'no-irregular-whitespace': [
        'error',
        {
          skipComments: true,
          skipRegExps: true,
          skipStrings: true,
          skipTemplates: true,
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          disallowTypeAnnotations: false,
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/interface/src/dashboard/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  eslintConfigPrettier,
);
