import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'huggingface';
const ENDPOINT = 'https://huggingface.co/api/daily_papers';

export interface HuggingFaceOptions {
  enabled: boolean;
  http: HttpClient;
  logger?: Logger;
  /** Minimum community upvotes for a paper to be returned. */
  minUpvotes?: number;
}

/** Relevant subset of a Hugging Face daily-papers entry. */
interface HfDailyPaper {
  title?: string | null;
  publishedAt?: string | null;
  paper?: {
    id?: string | null;
    title?: string | null;
    summary?: string | null;
    upvotes?: number | null;
    publishedAt?: string | null;
  } | null;
}

/**
 * Adapter for Hugging Face's "Daily Papers" feed
 * (https://huggingface.co/papers). No API key required.
 *
 * A curated stream of notable new AI papers (new models, techniques, results) —
 * exactly the "what's new and worth learning" signal a developer wants.
 * Relevance is left to the core scorer; an optional upvote gate trims noise.
 */
export class HuggingFaceProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly minUpvotes: number;

  constructor(options: HuggingFaceOptions) {
    this.enabled = options.enabled;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
    this.minUpvotes = options.minUpvotes ?? 0;
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('limit', String(Math.min(query.limit, 100)));

    try {
      const papers = await this.http.getJson<HfDailyPaper[]>(url.toString());
      const items: RawNewsItem[] = [];
      for (const entry of papers ?? []) {
        const paper = entry.paper ?? {};
        const title = paper.title ?? entry.title;
        const id = paper.id;
        if (!title || !id) continue;
        if ((paper.upvotes ?? 0) < this.minUpvotes) continue;

        items.push({
          title,
          url: `https://huggingface.co/papers/${id}`,
          source: 'Hugging Face Papers',
          publishedAt: paper.publishedAt ?? entry.publishedAt ?? undefined,
          description: truncate(paper.summary),
          language: 'en',
          provider: PROVIDER_NAME,
        });
      }
      this.logger.info(`[${PROVIDER_NAME}] received ${items.length} paper(s)`);
      return items;
    } catch (error) {
      this.logger.warn(
        `[${PROVIDER_NAME}] search failed for ${maskUrl(url.toString())}: ${describeError(error)}`,
      );
      return [];
    }
  }
}

/** Abstracts can be long; keep the description compact for a digest embed. */
function truncate(summary?: string | null): string | undefined {
  if (!summary) return undefined;
  const clean = summary.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > 300 ? `${clean.slice(0, 297)}…` : clean;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
