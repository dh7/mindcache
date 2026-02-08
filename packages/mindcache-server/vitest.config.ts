import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'mindcache/server': path.resolve(__dirname, '../mindcache/src/server.ts'),
      mindcache: path.resolve(__dirname, '../mindcache/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
