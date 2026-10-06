import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createDb } from '../../src/db/client.js';
import { NewsRepository } from '../../src/db/repository.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { runPipeline } from '../../src/pipeline/run.js';
import type { NewsProvider, Notifier, RawNewsItem } from '../../src/domain/types.js';

const NOW = new Date('2026-06-23T12:00:00.000Z');

function rawItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    title: 'OpenAI releases GPT-5',
    url: 'https://example.com/a',
    source: 'Example',
    publishedAt: '2026-06-23T10:00:00.000Z',
    description: 'A new language model is available.',
    provider: 'fake',
    ...overrides,
  };
}

function fakeProvider(items: RawNewsItem[]): NewsProvider {
  return { name: 'fake', enabled: true, search: async () => items };
}

function recordingNotifier(delivered: boolean): Notifier & { calls: number } {
  return {
    name: 'fake-notifier',
    enabled: true,
    calls: 0,
    async notify(items) {
      this.calls += 1;
      return { delivered, itemCount: delivered ? items.length : 0 };
    },
  };
}

const config = loadConfig({
  NEWS_KEYWORDS: 'artificial intelligence,machine learning,OpenAI,GPT-5',
  NEWS_MIN_SCORE: '5',
});

describe('runPipeline', () => {
  let repository: NewsRepository;

  beforeEach(() => {
    repository = new NewsRepository(createDb(':memory:'));
  });

  it('runs the full flow and reports counters', async () => {
    const registry = new ProviderRegistry([
      fakeProvider([
        rawItem({ url: 'https://example.com/a' }),
        rawItem({ url: 'https://example.com/b', title: 'OpenAI announces a machine learning update' }),
      ]),
    ]);
    const notifier = recordingNotifier(true);

    const summary = await runPipeline({
      config,
      registry,
      repository,
      notifier,
      now: () => NOW,
    });

    expect(summary.fetched).toBe(2);
    expect(summary.kept).toBe(2);
    expect(summary.inserted).toBe(2);
    expect(summary.delivered).toBe(2);
    expect(notifier.calls).toBe(1);
  });

  it('deduplicates across runs (second run inserts nothing)', async () => {
    const registry = new ProviderRegistry([fakeProvider([rawItem()])]);
    const notifier = recordingNotifier(true);
    const deps = { config, registry, repository, notifier, now: () => NOW };

    const first = await runPipeline(deps);
    const second = await runPipeline(deps);

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.delivered).toBe(0);
  });

  it('drops irrelevant items below the minimum score', async () => {
    const registry = new ProviderRegistry([
      fakeProvider([rawItem({ title: 'cooking pasta', description: 'no tech here' })]),
    ]);
    const notifier = recordingNotifier(true);

    const summary = await runPipeline({ config, registry, repository, notifier, now: () => NOW });

    expect(summary.fetched).toBe(1);
    expect(summary.kept).toBe(0);
    expect(summary.inserted).toBe(0);
  });

  it('does not mark items delivered when delivery fails', async () => {
    const registry = new ProviderRegistry([fakeProvider([rawItem()])]);
    const notifier = recordingNotifier(false);
    const markSpy = vi.spyOn(repository, 'markDelivered');

    const summary = await runPipeline({ config, registry, repository, notifier, now: () => NOW });

    expect(summary.inserted).toBe(1);
    expect(summary.delivered).toBe(0);
    expect(markSpy).not.toHaveBeenCalled();
  });
});
