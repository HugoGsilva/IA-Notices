import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../../src/domain/types.js';

const query: NewsSearchQuery = {
  keywords: ['ai'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 5,
};

function fakeProvider(
  name: string,
  enabled: boolean,
  behaviour: () => Promise<RawNewsItem[]>,
): NewsProvider {
  return { name, enabled, search: behaviour };
}

const item = (name: string): RawNewsItem => ({
  title: `t-${name}`,
  url: `https://example.com/${name}`,
  provider: name,
});

describe('ProviderRegistry', () => {
  it('only queries enabled providers', async () => {
    const registry = new ProviderRegistry([
      fakeProvider('on', true, async () => [item('on')]),
      fakeProvider('off', false, async () => [item('off')]),
    ]);

    const results = await registry.searchAll(query);
    expect(results.map((r) => r.provider)).toEqual(['on']);
    expect(registry.enabled().map((p) => p.name)).toEqual(['on']);
  });

  it('isolates a failing provider from the others', async () => {
    const registry = new ProviderRegistry([
      fakeProvider('bad', true, async () => {
        throw new Error('kaboom');
      }),
      fakeProvider('good', true, async () => [item('good')]),
    ]);

    const results = await registry.searchAll(query);
    expect(results.map((r) => r.provider)).toEqual(['good']);
  });

  it('builds disabled real + stub providers from a default config', () => {
    const registry = ProviderRegistry.fromConfig(loadConfig({}));
    const names = registry.all().map((p) => p.name);
    expect(names).toEqual([
      'newsapi',
      'gdelt',
      'guardian',
      'hackernews',
      'reddit',
      'huggingface',
      'rss',
      'eventregistry',
      'nyt',
      'mediastack',
    ]);
    // Everything is disabled by default.
    expect(registry.enabled()).toEqual([]);
  });

  it('enables providers when configured', () => {
    const registry = ProviderRegistry.fromConfig(
      loadConfig({
        NEWSAPI_ENABLED: 'true',
        NEWSAPI_KEY: 'k',
        GDELT_ENABLED: 'true',
        GUARDIAN_ENABLED: 'true',
        GUARDIAN_KEY: 'g',
        HACKERNEWS_ENABLED: 'true',
        REDDIT_ENABLED: 'true',
        HUGGINGFACE_ENABLED: 'true',
        RSS_ENABLED: 'true',
      }),
    );
    expect(registry.enabled().map((p) => p.name)).toEqual([
      'newsapi',
      'gdelt',
      'guardian',
      'hackernews',
      'reddit',
      'huggingface',
      'rss',
    ]);
  });
});
