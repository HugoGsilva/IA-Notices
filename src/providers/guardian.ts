import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'guardian';
const ENDPOINT = 'https://content.guardianapis.com/search';
/** The Guardian Content Search API caps page-size at 50. */
const MAX_PAGE_SIZE = 50;

export interface GuardianOptions {
  enabled: boolean;
  apiKey?: string;
  http: HttpClient;
  logger?: Logger;
}

/** Shape of the relevant subset of a Guardian Content Search response. */
interface GuardianResponse {
  response?: {
    status?: string;
    results?: Array<{
      webTitle?: string | null;
      webUrl?: string | null;
      webPublicationDate?: string | null;
      sectionName?: string | null;
      fields?: {
        trailText?: string | null;
        thumbnail?: string | null;
      } | null;
    }>;
  };
}

/**
 * Adapter for The Guardian Open Platform Content Search API
 * (https://open-platform.theguardian.com/documentation).
 *
 * The API key is read only from configuration. The Guardian expects it as the
 * `api-key` query parameter, so it necessarily appears in the request URL — but
 * the shared `maskUrl` helper redacts the whole querystring before anything is
 * logged, so the key never reaches the logs. The provider is disabled unless
 * both the flag is on and a key is present.
 */
export class GuardianProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(options: GuardianOptions) {
    this.apiKey = options.apiKey ?? '';
    this.enabled = options.enabled && this.apiKey.length > 0;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('q', buildQuery(query.keywords));
    url.searchParams.set('from-date', toGuardianDate(query.from));
    url.searchParams.set('lang', query.language);
    url.searchParams.set('order-by', 'newest');
    url.searchParams.set('page-size', String(Math.min(query.limit, MAX_PAGE_SIZE)));
    url.searchParams.set('show-fields', 'trailText,thumbnail');
    url.searchParams.set('api-key', this.apiKey);

    try {
      const body = await this.http.getJson<GuardianResponse>(url.toString());
      return (body.response?.results ?? [])
        .filter((result) => result.webTitle && result.webUrl)
        .map((result) => ({
          title: result.webTitle!,
          url: result.webUrl!,
          source: 'The Guardian',
          publishedAt: result.webPublicationDate ?? undefined,
          description: result.fields?.trailText ?? undefined,
          imageUrl: result.fields?.thumbnail ?? undefined,
          language: query.language,
          provider: PROVIDER_NAME,
        }));
    } catch (error) {
      // Isolate the failure: log (with a masked URL) and return no items.
      this.logger.warn(
        `[${PROVIDER_NAME}] search failed for ${maskUrl(url.toString())}: ${describeError(error)}`,
      );
      return [];
    }
  }
}

/** Build a Guardian query, quoting multi-word phrases and OR-ing the terms. */
function buildQuery(keywords: string[]): string {
  const terms = keywords.map((keyword) => (keyword.includes(' ') ? `"${keyword}"` : keyword));
  return terms.length > 1 ? `(${terms.join(' OR ')})` : (terms[0] ?? '');
}

/** The Guardian `from-date` expects a `YYYY-MM-DD` calendar date (UTC). */
function toGuardianDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
