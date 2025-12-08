module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleNameMapper: {
    '^mindcache$': '<rootDir>/packages/mindcache/src/index.ts'
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
