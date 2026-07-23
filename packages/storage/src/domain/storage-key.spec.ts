import { buildStorageKey } from './storage-key';

describe('buildStorageKey', () => {
  it('builds the canonical companyId/module/entityType/entityId/filename shape', () => {
    expect(buildStorageKey('co1', 'finance', 'invoice', 'inv1', 'file.pdf')).toBe(
      'co1/finance/invoice/inv1/file.pdf',
    );
  });

  it('rejects an invalid module', () => {
    expect(() => buildStorageKey('co1', 'bogus' as never, 'invoice', 'inv1', 'f.pdf')).toThrow(
      /Invalid storage module/,
    );
  });

  it('rejects unsafe segments (path traversal attempt)', () => {
    expect(() => buildStorageKey('co1', 'finance', 'invoice', '../../etc', 'f.pdf')).toThrow(
      /Invalid storage key segment/,
    );
  });

  it('rejects an empty filename', () => {
    expect(() => buildStorageKey('co1', 'finance', 'invoice', 'inv1', '')).toThrow(
      /Invalid storage key segment/,
    );
  });
});
