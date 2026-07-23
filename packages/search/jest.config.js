/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@platform/core$': '<rootDir>/../core/src/index.ts',
    '^@platform/database$': '<rootDir>/../database/src/index.ts',
  },
};
