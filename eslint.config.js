import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[\\u3040-\\u30ff\\u4e00-\\u9faf]/]',
          message: '画面文言は i18n.ts に置き tr() 経由で参照してください',
        },
      ],
    },
  },
  {
    // Only file allowed to call console.debug/log directly (see log.ts).
    files: ['src/utils/log.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Test mocks routinely do `expect(fakeInstance.method).toHaveBeenCalled()`
    // against `as unknown as RealClass`-cast fakes — never real instances that
    // rely on `this`, so the rule has nothing to protect here.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
])
