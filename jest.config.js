/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // Only compile test files and their imports, skip type checking for speed
      diagnostics: false,
      isolatedModules: true,
    }],
  },
  // Limit to test files + service files only
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};