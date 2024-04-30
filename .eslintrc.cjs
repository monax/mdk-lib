/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true },
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'src/queries/*.types.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'import/extensions': ['error', 'ignorePackages'],
    'import/no-unresolved': 'off',
    'no-case-declarations': 'off',
  },
};
