/**
 * Provider-agnostic object storage interface. Cloudflare R2 (production) and MinIO (local
 * dev/test) are both S3-API-compatible, so one adapter implements this for both — see
 * docs/DOMAIN_MODEL_PHASE3.md §2.
 */
export interface StoragePort {
  upload(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; etag?: string }>;

  download(key: string): Promise<{ body: Buffer; contentType?: string }>;

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}

export class StorageObjectNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
