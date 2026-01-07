module.exports = {
  // Use ts-jest for TypeScript instead of babel
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only look in __tests__ and src for tests
  roots: ['<rootDir>/__tests__', '<rootDir>/src'],

  // Match test files
  testMatch: ['**/*.test.ts'],

  // TypeScript transformation
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Allow JS imports
        allowJs: true,
        esModuleInterop: true,
        module: 'commonjs',
        moduleResolution: 'node',
        strict: true,
        target: 'ES2020',
      },
    }],
  },

  // Don't transform node_modules
  transformIgnorePatterns: ['/node_modules/'],

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Coverage settings
  collectCoverageFrom: [
    'src/game/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],

  // Verbose output
  verbose: true,
};
