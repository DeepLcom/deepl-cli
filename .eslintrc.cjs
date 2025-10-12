module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.test.json'],
  },
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:jest/recommended',
    'prettier', // Must be last to override other configs
  ],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    // TypeScript specific
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    '@typescript-eslint/strict-boolean-expressions': 'off',

    // General
    'no-console': 'off', // CLI tool, console is expected
    'no-process-exit': 'off', // CLI tool, process.exit is expected
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-throw-literal': 'error',

    // Jest specific
    'jest/expect-expect': 'error',
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/valid-expect': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.js', // Ignore config files in root
  ],
  overrides: [
    {
      // Relax rules for test files
      files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' in tests
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/unbound-method': 'off', // Allow unbound methods (common with jest.fn())
        '@typescript-eslint/await-thenable': 'off', // Allow awaiting non-promises in tests
        '@typescript-eslint/ban-types': 'off', // Allow Function type in tests
        'jest/no-conditional-expect': 'off', // Allow conditional expects in tests
        'jest/no-jasmine-globals': 'off', // Allow fail() in tests
      },
    },
  ],
};
