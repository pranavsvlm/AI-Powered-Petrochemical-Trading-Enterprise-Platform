import { computeSha256 } from './document-hash';

describe('computeSha256', () => {
  it('is deterministic for identical content', () => {
    const a = computeSha256(Buffer.from('hello world'));
    const b = computeSha256(Buffer.from('hello world'));
    expect(a).toBe(b);
  });

  it('differs for different content', () => {
    const a = computeSha256(Buffer.from('hello world'));
    const b = computeSha256(Buffer.from('hello world!'));
    expect(a).not.toBe(b);
  });

  it('matches a known SHA-256 vector for an empty buffer', () => {
    expect(computeSha256(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
