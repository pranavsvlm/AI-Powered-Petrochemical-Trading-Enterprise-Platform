import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import type { StoragePort } from '../domain/storage-port';
import { StorageObjectNotFoundError } from '../domain/storage-port';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** MinIO needs path-style URLs; R2 and real S3 support both, so default true is safe. */
  forcePathStyle?: boolean;
}

/**
 * One adapter for both Cloudflare R2 (production) and MinIO (local dev/test) since both
 * speak the S3 API — see docs/DOMAIN_MODEL_PHASE3.md §2. Which backend it talks to is
 * purely a matter of the config passed in (endpoint/credentials/bucket).
 */
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ key: string; etag?: string }> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );
    return { key, etag: result.ETag };
  }

  async download(key: string): Promise<{ body: Buffer; contentType?: string }> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = await streamToBuffer(result.Body);
      return { body, contentType: result.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NoSuchKey') {
        throw new StorageObjectNotFoundError(key);
      }
      throw err;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return presign(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (
        err instanceof NotFound ||
        (err as { name?: string; $metadata?: { httpStatusCode?: number } }).name === 'NotFound'
      ) {
        return false;
      }
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw err;
    }
  }
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
