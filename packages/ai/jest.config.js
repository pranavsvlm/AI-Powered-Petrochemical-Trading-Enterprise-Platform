/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@platform/core$': '<rootDir>/../core/src/index.ts',
    '^@platform/database$': '<rootDir>/../database/src/index.ts',
    '^@platform/types$': '<rootDir>/../types/src/index.ts',
    '^@platform/permissions$': '<rootDir>/../permissions/src/index.ts',
    '^@platform/rules-engine$': '<rootDir>/../rules-engine/src/index.ts',
    '^@platform/storage$': '<rootDir>/../storage/src/index.ts',
    '^@platform/notifications$': '<rootDir>/../notifications/src/index.ts',
  },
};
