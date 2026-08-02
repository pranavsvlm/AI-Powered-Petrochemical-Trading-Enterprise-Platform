import { SetMetadata } from '@nestjs/common';

export const DEPRECATED_KEY = 'deprecated';

export interface DeprecatedMetadata {
  /** ISO 8601 date the route stops being supported — surfaced as an RFC 8594 `Sunset` header. */
  sunset?: string;
}

/**
 * Marks a route deprecated per RFC 8594 — `DeprecationInterceptor` adds the `Deprecation` and
 * (if `sunset` is given) `Sunset` response headers. Real and reusable, but unapplied anywhere
 * yet: this is the platform's first API version, so there is nothing genuinely legacy to mark.
 */
export const Deprecated = (sunset?: string) =>
  SetMetadata(DEPRECATED_KEY, { sunset } satisfies DeprecatedMetadata);
