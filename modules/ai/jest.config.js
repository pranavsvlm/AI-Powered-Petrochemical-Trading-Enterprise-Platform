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
    '^@platform/ai$': '<rootDir>/../../packages/ai/src/index.ts',
    '^@platform/permissions$': '<rootDir>/../../packages/permissions/src/index.ts',
    '^@platform/rules-engine$': '<rootDir>/../../packages/rules-engine/src/index.ts',
    '^@platform/storage$': '<rootDir>/../../packages/storage/src/index.ts',
    '^@platform/notifications$': '<rootDir>/../../packages/notifications/src/index.ts',
  },
};
