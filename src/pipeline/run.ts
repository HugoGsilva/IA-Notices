import type { AppConfig } from '../config/env.js';
import type { NewsItem, NewsSearchQuery, Notifier } from '../domain/types.js';
import type { NewsRepository } from '../db/repository.js';
import type { ProviderRegistry } from '../providers/registry.js';
import { noopLogger, type Logger } from '../logging/logger.js';
import { dedupItems } from './dedup.js';
import { filterItems } from './filter.js';
import { normalizeAll } from './normalize.js';
import { scoreAll } from './score.js';

const HOUR_MS = 60 * 60 * 1000;
/** Discord allows at most 10 embeds per message. */
const MAX_DELIVERED = 10;

export interface RunDeps {
  config: AppConfig;
  registry: ProviderRegistry;
  repository: NewsRepository;
  notifier: Notifier;
  logger?: Logger;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/** Counters describing one pipeline run. Contains no sensitive data. */
export interface RunSummary {
  fetched: number;
  kept: number;
  inserted: number;
  delivered: number;
}

/**
 * Orchestrate a single pipeline run:
 * fetch → normalize → score → filter → dedup (batch + DB) → persist →
 * deliver → mark delivered. Pure pieces do the work; this only wires them and
 * isolates side effects (DB, notifier).
 */
export async function runPipeline(deps: RunDeps): Promise<RunSummary> {
  const { config, registry, repository, notifier } = deps;
  const logger = deps.logger ?? noopLogger;
  const now = deps.now?.() ?? new Date();
  const from = new Date(now.getTime() - config.NEWS_LOOKBACK_HOURS * HOUR_MS);

  const query: NewsSearchQuery = {
    keywords: config.NEWS_KEYWORDS,
    from,
    language: config.NEWS_LANGUAGE,
    limit: config.NEWS_MAX_ITEMS,
  };

  const raw = await registry.searchAll(query);
  const normalized = normalizeAll(raw, now);
  const scored = scoreAll(normalized, config.NEWS_KEYWORDS, now);
  const filtered = filterItems(scored, {
    from,
    language: config.NEWS_LANGUAGE,
    minScore: config.NEWS_MIN_SCORE,
  });
  const deduped = dedupItems(filtered);

  // Cross-run deduplication: skip anything already stored.
  const existing = repository.existingDedupKeys(deduped.map((item) => item.dedupKey));
  const fresh = deduped.filter((item) => !existing.has(item.dedupKey));

  const inserted = repository.insertMany(fresh);

  // Deliver the strongest fresh items (capped to Discord's embed limit).
  const toDeliver = selectForDelivery(fresh, config.NEWS_MAX_ITEMS);
  const result = await notifier.notify(toDeliver);
  if (result.delivered) {
    const deliveredKeys = toDeliver.slice(0, result.itemCount).map((item) => item.dedupKey);
    repository.markDelivered(deliveredKeys, now.toISOString());
  }

  const summary: RunSummary = {
    fetched: raw.length,
    kept: deduped.length,
    inserted,
    delivered: result.delivered ? result.itemCount : 0,
  };
  logger.info(
    `[pipeline] run complete: fetched=${summary.fetched} kept=${summary.kept} ` +
      `inserted=${summary.inserted} delivered=${summary.delivered}`,
  );
  return summary;
}

/** Top items by score, capped to what a single digest can carry. */
function selectForDelivery(items: NewsItem[], maxItems: number): NewsItem[] {
  const limit = Math.min(maxItems, MAX_DELIVERED);
  return [...items].sort((a, b) => b.score - a.score).slice(0, limit);
}
