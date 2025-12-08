module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
    node: true
  },
  globals: {
    React: 'readonly',
    NodeJS: 'readonly',
    RequestInit: 'readonly'
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_',
      'destructuredArrayIgnorePattern': '^_'
    }]
  }
};

