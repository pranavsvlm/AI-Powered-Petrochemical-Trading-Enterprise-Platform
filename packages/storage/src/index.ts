export const PACKAGE_NAME = '@platform/storage';

export type { StoragePort } from './domain/storage-port';
export { StorageObjectNotFoundError } from './domain/storage-port';

export { buildStorageKey, STORAGE_MODULES } from './domain/storage-key';
export type { StorageModule } from './domain/storage-key';

export type { OcrProvider, OcrResult } from './domain/ocr-provider.port';
export { NotImplementedOcrProvider } from './domain/ocr-provider.port';

export { S3StorageAdapter } from './infrastructure/s3-storage.adapter';
export type { S3StorageConfig } from './infrastructure/s3-storage.adapter';
export { createStorageAdapter, getSharedStorage } from './infrastructure/storage-factory';
