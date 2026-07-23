import { Readable } from 'node:stream';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class NotFound extends Error {}
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    NotFound,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/url'),
}));

import { S3StorageAdapter } from './s3-storage.adapter';
import { StorageObjectNotFoundError } from '../domain/storage-port';

describe('S3StorageAdapter', () => {
  const adapter = new S3StorageAdapter({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    bucket: 'test-bucket',
  });

  beforeEach(() => sendMock.mockReset());

  it('uploads and returns the key and etag', async () => {
    sendMock.mockResolvedValueOnce({ ETag: '"abc123"' });
    const result = await adapter.upload(
      'co1/finance/x/1/f.pdf',
      Buffer.from('hi'),
      'application/pdf',
    );
    expect(result).toEqual({ key: 'co1/finance/x/1/f.pdf', etag: '"abc123"' });
  });

  it('downloads and buffers the body stream', async () => {
    const body = Readable.from([Buffer.from('hello '), Buffer.from('world')]);
    sendMock.mockResolvedValueOnce({ Body: body, ContentType: 'text/plain' });
    const result = await adapter.download('co1/finance/x/1/f.txt');
    expect(result.body.toString()).toBe('hello world');
    expect(result.contentType).toBe('text/plain');
  });

  it('throws StorageObjectNotFoundError on a missing key', async () => {
    const err = new Error('not found') as Error & { name: string };
    err.name = 'NoSuchKey';
    sendMock.mockRejectedValueOnce(err);
    await expect(adapter.download('missing')).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('returns a signed URL', async () => {
    const url = await adapter.getSignedUrl('co1/finance/x/1/f.pdf', 3600);
    expect(url).toBe('https://signed.example/url');
  });

  it('exists() returns false on a 404-shaped error', async () => {
    sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(adapter.exists('missing')).resolves.toBe(false);
  });

  it('exists() returns true when HeadObject succeeds', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(adapter.exists('co1/finance/x/1/f.pdf')).resolves.toBe(true);
  });

  it('deletes an object', async () => {
    sendMock.mockResolvedValueOnce({});
    await expect(adapter.delete('co1/finance/x/1/f.pdf')).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
