import type { NewsProvider } from '../domain/types.js';

/**
 * Placeholder providers for sources planned but out of MVP scope. They follow
 * the common `NewsProvider` contract, are always disabled, and never fetch
 * anything. Real adapters replace these following AGENTS.md section 13.
 *
 * Planned (see AGENTS.md section 5): Event Registry / NewsAPI.ai,
 * NYT Article Search, Mediastack.
 */
class DisabledProvider implements NewsProvider {
  readonly enabled = false;
  constructor(readonly name: string) {}
  async search(): Promise<never[]> {
    return [];
  }
}

export const STUB_PROVIDER_NAMES = ['eventregistry', 'nyt', 'mediastack'] as const;

/** Build the disabled stub providers for sources not yet implemented. */
export function createStubProviders(): NewsProvider[] {
  return STUB_PROVIDER_NAMES.map((name) => new DisabledProvider(name));
}
