module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
    node: true
  },
  rules: {
    // Disable base rule in favor of TypeScript version
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_',
      'destructuredArrayIgnorePattern': '^_'
    }]
  }
};

