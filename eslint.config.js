import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Disable strict rules for existing codebase
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'test/', '*.config.js'],
  }
);
