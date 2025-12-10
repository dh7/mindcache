module.exports = {
  env: {
    es2022: true,
  },
  globals: {
    // Cloudflare Workers globals
    DurableObject: 'readonly',
    DurableObjectState: 'readonly',
    DurableObjectNamespace: 'readonly',
    SqlStorage: 'readonly',
    WebSocket: 'readonly',
    WebSocketPair: 'readonly',
    D1Database: 'readonly',
    ExecutionContext: 'readonly',
    Response: 'readonly',
    Request: 'readonly',
    URL: 'readonly',
    Headers: 'readonly',
    crypto: 'readonly',
    console: 'readonly',
  },
  rules: {
    'no-undef': 'off', // TypeScript handles this
    'no-console': 'off', // Workers use console for logging
    'max-len': 'off', // SQL queries can be long
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-unused-vars': 'off', // Let TypeScript handle this
  },
};

