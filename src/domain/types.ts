/**
 * Shared domain contracts.
 *
 * These types are the boundary between the pluggable edges (providers,
 * notifier) and the core pipeline. The core operates exclusively on the
 * normalised types declared here and never sees a provider-specific shape.
 *
 * The provider/notifier contracts follow the "Interface conceitual obrigatória"
 * in `AGENTS.md`.
 */

/** Search criteria handed uniformly to every provider. */
export interface NewsSearchQuery {
  /** AI keywords/themes to look for. */
  keywords: string[];
  /** Lower bound of the time window. */
  from: Date;
  /** Preferred language (ISO 639-1), when the provider supports it. */
  language: string;
  /** Maximum number of items to return. */
  limit: number;
}

/** Raw item returned by a provider, before core normalisation. */
export interface RawNewsItem {
  title: string;
  url: string;
  source?: string;
  /** ISO-8601, when available. */
  publishedAt?: string;
  description?: string;
  imageUrl?: string;
  language?: string;
  /** Name of the originating provider. */
  provider: string;
}

/**
 * Normalised, curated item produced by the core pipeline. This is the internal
 * shape used for scoring, deduplication, persistence and digest formatting.
 */
export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  /** ISO-8601 timestamp. */
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
  language: string | null;
  provider: string;
  /** Relevance score computed by the heuristic scorer. */
  score: number;
  /** Categories assigned during curation. */
  categories: string[];
  /** Stable key used to deduplicate within and across runs. */
  dedupKey: string;
  /** ISO-8601 timestamp of when the item was fetched/normalised. */
  fetchedAt: string;
}

/**
 * Pluggable news source. The only permitted way to integrate an external API.
 *
 * Contract:
 * - `name` is unique and stable.
 * - `enabled` reflects configuration + credential presence; when `false` the
 *   provider is not executed.
 * - `search` never throws on empty results (returns `[]`); network/HTTP errors
 *   are handled and isolated so one provider cannot break the others.
 */
export interface NewsProvider {
  readonly name: string;
  readonly enabled: boolean;
  search(query: NewsSearchQuery): Promise<RawNewsItem[]>;
}

/** Result summary of a notification attempt. */
export interface NotifyResult {
  delivered: boolean;
  /** Number of items included in the delivered digest. */
  itemCount: number;
}

/**
 * Pluggable notification transport. The MVP ships a Discord Webhook
 * implementation; a future bot transport can sit behind the same interface
 * without touching the core.
 */
export interface Notifier {
  readonly name: string;
  readonly enabled: boolean;
  /** Deliver a curated digest. A disabled notifier is a safe no-op. */
  notify(items: NewsItem[]): Promise<NotifyResult>;
}
