/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.spec.ts', '**/test/**/*.test.ts', '**/test/**/*.e2e-spec.ts'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Exclude index.ts from coverage - it's an entry point with signal handlers
  // and process.exit() that's effectively tested via E2E tests in CI
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/types.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
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
    '^@opencode-ai/sdk$': '<rootDir>/test/mocks/@opencode-ai/sdk.ts',
    // @actions/core v3 is ESM-only; moduleNameMapper is required for Jest CJS resolution
    '^@actions/core$': '<rootDir>/test/mocks/@actions/core.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!(@opencode-ai)/)'],
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
