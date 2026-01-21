import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import preferArrowFunctions from 'eslint-plugin-prefer-arrow-functions';
import promise from 'eslint-plugin-promise';
import reactPreferFunctionComponent from 'eslint-plugin-react-prefer-function-component';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'postcss.config.mjs']),
  {
    extends: fixupConfigRules(
      compat.extends(
        'plugin:sonarjs/recommended-legacy',
        'plugin:security/recommended-legacy',
        'plugin:promise/recommended',
        'plugin:react-prefer-function-component/recommended',
      ),
    ),
    plugins: {
      sonarjs: fixupPluginRules(sonarjs),
      security: fixupPluginRules(security),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      promise: fixupPluginRules(promise),
      'react-prefer-function-component': fixupPluginRules(reactPreferFunctionComponent),
      'prefer-arrow-functions': preferArrowFunctions,
    },
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',

      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],

      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',

      '@typescript-eslint/strict-boolean-expressions': [
        'warn',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
      ],

      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'array-bracket-spacing': ['error', 'never'],
      'arrow-parens': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      curly: ['error', 'all'],

      eqeqeq: [
        'error',
        'always',
        {
          null: 'ignore',
        },
      ],

      'key-spacing': [
        'error',
        {
          beforeColon: false,
          afterColon: true,
        },
      ],

      'keyword-spacing': [
        'error',
        {
          before: true,
          after: true,
        },
      ],

      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxEOF: 1,
        },
      ],

      'no-trailing-spaces': 'error',
      'object-curly-spacing': ['error', 'always'],
      semi: ['error', 'always'],
      'space-before-blocks': ['error', 'always'],

      'spaced-comment': [
        'error',
        'always',
        {
          markers: ['/'],
        },
      ],

      'no-console': 'error',
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-return-await': 'error',
      'no-unused-vars': 'off',
      'no-var': 'error',

      complexity: [
        'off',
        {
          max: 10,
        },
      ],

      'no-else-return': [
        'error',
        {
          allowElseIf: false,
        },
      ],

      'no-lonely-if': 'error',

      'no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
        },
      ],

      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',

      'prefer-destructuring': [
        'error',
        {
          object: true,
          array: false,
        },
      ],

      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      yoda: 'error',

      'import/extensions': ['error', 'never', { json: 'always', css: 'always', scss: 'always' }],
      'import/first': 'error',
      'import/max-dependencies': ['error', { max: 20 }],
      'import/newline-after-import': 'error',
      'import/no-absolute-path': 'error',
      'import/no-anonymous-default-export': 'error',
      'import/no-cycle': 'off',
      'import/no-deprecated': 'warn',
      'import/no-duplicates': 'error',
      'import/no-dynamic-require': 'error',
      'import/no-import-module-exports': 'error',
      'import/no-mutable-exports': 'error',
      'import/no-named-as-default': 'error',
      'import/no-named-default': 'error',
      'import/no-relative-packages': 'error',
      'import/no-self-import': 'error',
      'import/no-unassigned-import': ['error', { allow: ['**/*.css', '**/*.scss'] }],
      'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import/no-webpack-loader-syntax': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['sibling', 'index'], 'type', 'object'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',

      'prefer-arrow-functions/prefer-arrow-functions': [
        'error',
        {
          classPropertiesAllowed: false,
          disallowPrototype: false,
          returnStyle: 'unchanged',
          singleReturnOnly: false,
        },
      ],

      'promise/always-return': 'error',
      'promise/avoid-new': 'off',
      'promise/catch-or-return': 'error',
      'promise/no-callback-in-promise': 'error',
      'promise/no-nesting': 'error',
      'promise/no-new-statics': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/valid-params': 'error',

      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
        },
      ],

      'react/jsx-fragments': ['error', 'syntax'],

      'react/jsx-no-bind': [
        'error',
        {
          allowArrowFunctions: true,
        },
      ],

      'react/jsx-no-leaked-render': 'error',

      'react/jsx-no-useless-fragment': [
        'error',
        {
          allowExpressions: true,
        },
      ],

      'react/jsx-pascal-case': 'error',
      'react/jsx-props-no-multi-spaces': 'error',

      'react/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          reservedFirst: true,
        },
      ],

      'react/no-array-index-key': 'error',
      'react/no-danger': 'error',
      'react/no-unsafe': 'error',
      'react/no-unstable-nested-components': 'error',
      'react/prop-types': 'error',
      'react/self-closing-comp': 'error',
      'react/void-dom-elements-no-children': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'error',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-regexp': 'error',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'error',
      'sonarjs/cognitive-complexity': ['off'],
      'sonarjs/max-switch-cases': ['off'],
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/unused-import': 'off',
      'sonarjs/no-duplicate-string': [
        'error',
        {
          threshold: 3,
        },
      ],
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-small-switch': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      'sonarjs/prefer-object-literal': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
      'max-statements-per-line': ['error', { max: 1 }],
      'no-param-reassign': 'error',
      'func-style': ['error', 'expression'],
    },
  },
  {
    files: ['src/components/ui/*.tsx'],

    rules: {
      'react/jsx-sort-props': 'off',
      '@typescript-eslint/naming-convention': 'off',
      'max-statements': 'off',
    },
  },
  {
    files: ['src/lib/env.ts'],

    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  {
    files: ['src/components/data-table/**/*.tsx', 'src/lib/parsers.ts'],

    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'sonarjs/function-return-type': 'warn',
    },
  },
  {
    files: ['src/components/data-grid/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'react-hooks/refs': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'no-nested-ternary': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'sonarjs/no-selector-parameter': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      'sonarjs/function-return-type': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'promise/always-return': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'react/jsx-sort-props': 'warn',
      'security/detect-unsafe-regex': 'warn',
      'sonarjs/deprecation': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-all-duplicated-branches': 'warn',
    },
  },
  {
    files: ['src/components/ai-elements/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'sonarjs/function-return-type': 'warn',
      'no-duplicate-imports': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react/prop-types': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'promise/always-return': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      'react/jsx-sort-props': 'warn',
      'react/no-danger': 'warn',
      'sonarjs/redundant-type-aliases': 'warn',
      'sonarjs/deprecation': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'promise/no-nesting': 'warn',
      'no-return-await': 'warn',
      'promise/catch-or-return': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      'sonarjs/no-useless-intersection': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      'no-console': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      'sonarjs/no-selector-parameter': 'warn',
      'react/no-array-index-key': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    },
  },
  {
    files: [
      'src/hooks/use-as-ref.ts',
      'src/hooks/use-badge-overflow.ts',
      'src/hooks/use-data-grid.ts',
      'src/hooks/use-isomorphic-layout-effect.ts',
      'src/hooks/use-lazy-ref.ts',
      'src/lib/data-grid.ts',
      'src/types/data-grid.ts',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'no-nested-ternary': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      'sonarjs/function-return-type': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'promise/always-return': 'warn',
      'security/detect-unsafe-regex': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-all-duplicated-branches': 'warn',
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    },
  },
]);

export default defineConfig(eslintConfig);
