import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'newsapi';
const ENDPOINT = 'https://newsapi.org/v2/everything';

export interface NewsApiOptions {
  enabled: boolean;
  apiKey?: string;
  http: HttpClient;
  logger?: Logger;
}

/** Shape of the relevant subset of a NewsAPI.org /v2/everything response. */
interface NewsApiResponse {
  status: string;
  articles?: Array<{
    source?: { name?: string | null } | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
  }>;
}

/**
 * Adapter for NewsAPI.org (https://newsapi.org/docs).
 *
 * The API key is read only from configuration and sent via the `X-Api-Key`
 * header — never in the URL or logs. The provider is disabled unless both the
 * flag is on and a key is present.
 */
export class NewsApiProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(options: NewsApiOptions) {
    this.apiKey = options.apiKey ?? '';
    this.enabled = options.enabled && this.apiKey.length > 0;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('q', query.keywords.join(' OR '));
    url.searchParams.set('from', query.from.toISOString());
    url.searchParams.set('language', query.language);
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(Math.min(query.limit, 100)));

    try {
      const body = await this.http.getJson<NewsApiResponse>(url.toString(), {
        headers: { 'X-Api-Key': this.apiKey },
      });
      return (body.articles ?? [])
        .filter((article) => article.title && article.url)
        .map((article) => ({
          title: article.title!,
          url: article.url!,
          source: article.source?.name ?? undefined,
          publishedAt: article.publishedAt ?? undefined,
          description: article.description ?? undefined,
          imageUrl: article.urlToImage ?? undefined,
          language: query.language,
          provider: PROVIDER_NAME,
        }));
    } catch (error) {
      // Isolate the failure: log (without secrets) and return no items.
      this.logger.warn(
        `[${PROVIDER_NAME}] search failed for ${maskUrl(url.toString())}: ${describeError(error)}`,
      );
      return [];
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
