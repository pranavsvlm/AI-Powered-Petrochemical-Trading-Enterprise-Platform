/**
 * Typed seam for functionality that is intentionally not implemented in the current
 * build phase (e.g. real LLM calls, WhatsApp/SMS/Push channels). Thrown instead of a
 * silent no-op so callers (and the global exception filter, mapped to HTTP 501) get an
 * explicit, typed, documented signal rather than a stub that does nothing quietly.
 *
 * See docs/DOMAIN_MODEL_PHASE2.md §1 and §2 for the two places this is used.
 */
export class NotImplementedInPhaseError extends Error {
  public readonly feature: string;
  public readonly availableFrom: string;

  constructor(feature: string, availableFrom: string) {
    super(`"${feature}" is not implemented in this phase. Planned for: ${availableFrom}.`);
    this.name = 'NotImplementedInPhaseError';
    this.feature = feature;
    this.availableFrom = availableFrom;
  }
}
