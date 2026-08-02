export type PluginCategory = 'INTEGRATION' | 'AI' | 'UI' | 'WORKFLOW';

export interface PluginDefinition {
  key: string;
  name: string;
  description: string;
  category: PluginCategory;
}

/**
 * Static in-code catalog, mirroring `AGENT_DEFINITIONS` (packages/ai/src/agent-sdk) — no real
 * third-party plugin content exists yet to justify a DB-backed Plugin/PluginVersion table, so
 * this is the entire "marketplace" this pass ships. `PluginInstall` (Prisma) is the only real
 * per-tenant state: which of these a company has installed/activated. Doc 29's sandboxed
 * third-party execution model is explicitly deferred — every catalog entry here is a first-party,
 * in-process, platform-authored capability being gated behind a real lifecycle, not arbitrary
 * uploaded code.
 */
export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    key: 'webhooks',
    name: 'Webhooks Integration',
    description:
      'Deliver real-time, HMAC-signed HTTP notifications to external URLs when platform events occur (e.g. orders created). Must be installed and activated before any webhook subscription can be created — deactivating pauses delivery of existing ones too.',
    category: 'INTEGRATION',
  },
];
