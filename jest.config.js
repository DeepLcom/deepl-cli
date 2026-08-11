/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
  ],
  // Exclude transient agent worktree copies; they shadow real tests and race on shared temp dirs.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/worktrees/',
  ],
  // Keep haste-map from indexing agent worktrees too — a leftover worktree
  // otherwise duplicates manual mocks (tests/__mocks__/*) and warns on every run.
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/cli/index.ts', // Main entry point
    '!src/cli/commands/translate/index.ts', // Barrel re-exports
    '!src/cli/commands/register-sync.ts', // CLI glue — tested by E2E (cli-sync.e2e.test.ts)
    '!src/cli/commands/sync/register-sync-*.ts', // CLI glue per-subcommand builders — tested by E2E
    '!src/cli/commands/sync/sync-options.ts', // CLI glue helper — tested via snapshot test
    '!src/cli/commands/register-detect.ts', // CLI glue — tested by E2E
    '!src/cli/commands/register-init.ts', // CLI glue — tested by E2E
    '!src/types/**/*.ts', // Type definitions
    '!src/version.ts', // Mocked in tests (uses import.meta.url)
    '!src/formats/php-parser-bridge.ts', // Mocked in tests (uses import.meta.url)
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
    '(.*)/php-parser-bridge\\.js$': '<rootDir>/tests/__mocks__/php-parser-bridge',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // tsconfig.json disables source maps to keep them out of the published
        // package. ts-jest merges the options below over that file rather than
        // replacing it, and istanbul needs the maps to attribute coverage to
        // TypeScript lines instead of to positions in the emitted JavaScript.
        sourceMap: true,
        // Relaxed settings for tests
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        // TypeScript 6.0 stopped auto-including all @types/* packages globally;
        // declare the ones the test suite needs (jest globals + node).
        types: ['node', 'jest'],
      },
    }],
    '^.+\\.jsx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        allowJs: true,
        types: ['node', 'jest'],
      },
    }],
  },

  // Transform ESM packages
  transformIgnorePatterns: [
    'node_modules/(?!(p-limit|yocto-queue|fast-glob|chalk|chokidar|readdirp|commander)/)',
  ],

  // Setup files
  globalSetup: '<rootDir>/tests/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // KNOWN BENIGN WARNING: every full-suite run ends with "A worker process has
  // failed to exit gracefully". nock's interceptor (@mswjs/interceptors) leaves
  // undrained IncomingMessage objects behind, each pinned as an
  // HTTPINCOMINGMESSAGE handle the worker cannot shed. All tests still pass.
  //
  // Nothing available here suppresses it: the teardown in tests/setup.ts and
  // HttpClient.destroy() never own that socket, `forceExit` fires too late, and
  // `--runInBand` avoids it at ~5x wall clock. Going past interceptors 0.41 is
  // untested — 0.42 is ESM-only and fails the CJS transform.
  //
  // Audit real leaks with `npm run test:debug` by handle type, not count:
  // anything but HTTPINCOMINGMESSAGE from @mswjs/interceptors is new.

  // Verbose output
  verbose: true,
};
