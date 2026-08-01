/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/**/*.spec.ts'],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^@platform/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^@platform/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@platform/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@platform/workflow$': '<rootDir>/../../packages/workflow/src/index.ts',
    '^@platform/notifications$': '<rootDir>/../../packages/notifications/src/index.ts',
  },
};
