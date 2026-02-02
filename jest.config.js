/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Exclude index.ts from coverage - it's an entry point with signal handlers
  // and process.exit() that's effectively tested via E2E tests in CI
  collectCoverageFrom: ['src/**/*.ts', '!src/types.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      // 75% branch coverage due to async timeout/abort paths that are difficult
      // to unit test but are covered by E2E tests in CI
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 60000,
  clearMocks: true,
  errorOnDeprecated: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
  },
};
