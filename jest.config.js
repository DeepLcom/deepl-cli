/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/cli/index.ts', // Main entry point
    '!src/cli/commands/translate/index.ts', // Barrel re-exports
    '!src/types/**/*.ts', // Type definitions
    '!src/version.ts', // Mocked in tests (uses import.meta.url)
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'cobertura'],
  coverageThreshold: {
    global: {
      branches: 86,
      functions: 94,
      lines: 93,
      statements: 93,
    },
  },

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '(.*)/version\\.js$': '<rootDir>/tests/__mocks__/version',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Relaxed settings for tests
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }],
  },

  // Transform ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(p-limit|yocto-queue|fast-glob|chalk)/)',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,
};
