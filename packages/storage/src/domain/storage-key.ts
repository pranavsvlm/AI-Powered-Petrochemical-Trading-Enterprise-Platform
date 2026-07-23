/** Modules doc 21 defines for the canonical storage folder structure. */
export const STORAGE_MODULES = [
  'finance',
  'hr',
  'products',
  'quotations',
  'contracts',
  'trading',
  'knowledge',
  'company',
] as const;

export type StorageModule = (typeof STORAGE_MODULES)[number];

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function assertSafeSegment(name: string, value: string): void {
  if (!value || !SAFE_SEGMENT.test(value)) {
    throw new Error(
      `Invalid storage key segment for "${name}": "${value}" — only alphanumerics, dot, underscore, and hyphen are allowed.`,
    );
  }
}

/**
 * Builds the one canonical storage key shape for the whole platform:
 * `{companyId}/{module}/{entityType}/{entityId}/{filename}`.
 * See docs/DOMAIN_MODEL_PHASE3.md §1 — no caller may hand-construct a storage key.
 */
export function buildStorageKey(
  companyId: string,
  module: StorageModule,
  entityType: string,
  entityId: string,
  filename: string,
): string {
  assertSafeSegment('companyId', companyId);
  if (!STORAGE_MODULES.includes(module)) {
    throw new Error(
      `Invalid storage module "${module}". Must be one of: ${STORAGE_MODULES.join(', ')}.`,
    );
  }
  assertSafeSegment('entityType', entityType);
  assertSafeSegment('entityId', entityId);
  assertSafeSegment('filename', filename);
  return `${companyId}/${module}/${entityType}/${entityId}/${filename}`;
}
