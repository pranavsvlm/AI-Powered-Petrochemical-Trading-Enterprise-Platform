import { S3StorageAdapter } from './s3-storage.adapter';
import type { StoragePort } from '../domain/storage-port';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * Builds the shared storage singleton from env vars. `STORAGE_PROVIDER=r2` (default in
 * production) talks to Cloudflare R2; `STORAGE_PROVIDER=minio` (default in dev/test) talks
 * to the local MinIO container added in docker/docker-compose.yml. Same adapter class either
 * way — see docs/DOMAIN_MODEL_PHASE3.md §2.
 */
export function createStorageAdapter(
  provider: 'r2' | 'minio' = (process.env.STORAGE_PROVIDER as 'r2' | 'minio') || 'minio',
): StoragePort {
  if (provider === 'r2') {
    const accountId = requireEnv('R2_ACCOUNT_ID');
    return new S3StorageAdapter({
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      bucket: requireEnv('R2_BUCKET_NAME'),
      forcePathStyle: false,
    });
  }

  return new S3StorageAdapter({
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    region: 'us-east-1',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'navoasis-documents',
    forcePathStyle: true,
  });
}

let sharedStorage: StoragePort | undefined;

export function getSharedStorage(): StoragePort {
  if (!sharedStorage) sharedStorage = createStorageAdapter();
  return sharedStorage;
}
