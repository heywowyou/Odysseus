// @ts-check

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,mjs,ts,tsx,mts}'];

/** @returns {import('eslint').Linter.RulesRecord} */
function typeAwarePromiseRules() {
  return {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
  };
}

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
    // source; the same policy .prettierignore applies to them. .zcode is a
    // session scratch directory on the same footing (gitignored since
    // 8b330c2). Prettier already skips all of these because Prettier 3
    // reads .gitignore as well as .prettierignore; ESLint reads neither, so
    // a scratch file that is not part of the project failed `pnpm run
    // check`, and with it the pre-push hook, for anyone who had one.
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.zcode/**',
    '.playwright-mcp/**',
    '.impeccable/live/**',
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
  // Issue #517: an un-awaited promise in a route or poller becomes an
  // unhandled rejection, and Node exits on one, taking every running audit
  // with the single server. These rules need type information, so they run
  // on package sources only; scripts and config files stay untyped.
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: ['packages/interface/src/dashboard/**'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: typeAwarePromiseRules(),
  },
  {
    // The dashboard compiles under its own config, which the project
    // service would not find from packages/interface/tsconfig.json.
    files: ['packages/interface/src/dashboard/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./packages/interface/tsconfig.dashboard.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeAwarePromiseRules(),
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
