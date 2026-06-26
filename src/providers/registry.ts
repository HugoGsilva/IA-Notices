import type { AppConfig } from '../config/env.js';
import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import { HttpClient } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';
import { GdeltProvider } from './gdelt.js';
import { GuardianProvider } from './guardian.js';
import { HackerNewsProvider } from './hackernews.js';
import { NewsApiProvider } from './newsapi.js';
import { createStubProviders } from './stubs.js';

/**
 * Composition root for providers. The core never imports a concrete provider —
 * it asks the registry for the enabled set and fans a query out to them.
 *
 * Each provider isolates its own failures (returns `[]` on error), so one
 * misbehaving source can never break the others.
 */
export class ProviderRegistry {
  private readonly providers: NewsProvider[];

  constructor(providers: NewsProvider[]) {
    this.providers = providers;
  }

  /** Build the registry from configuration and a shared HTTP client. */
  static fromConfig(config: AppConfig, logger: Logger = noopLogger): ProviderRegistry {
    const http = new HttpClient({
      timeoutMs: config.HTTP_TIMEOUT_MS,
      retries: config.HTTP_RETRIES,
    });

    const providers: NewsProvider[] = [
      new NewsApiProvider({
        enabled: config.NEWSAPI_ENABLED,
        apiKey: config.NEWSAPI_KEY,
        http,
        logger,
      }),
      new GdeltProvider({ enabled: config.GDELT_ENABLED, http, logger }),
      new GuardianProvider({
        enabled: config.GUARDIAN_ENABLED,
        apiKey: config.GUARDIAN_KEY,
        http,
        logger,
      }),
      new HackerNewsProvider({ enabled: config.HACKERNEWS_ENABLED, http, logger }),
      ...createStubProviders(),
    ];

    return new ProviderRegistry(providers);
  }

  /** All registered providers, regardless of state. */
  all(): readonly NewsProvider[] {
    return this.providers;
  }

  /** Only the providers that are enabled (configured with credentials). */
  enabled(): NewsProvider[] {
    return this.providers.filter((provider) => provider.enabled);
  }

  /**
   * Run the query across every enabled provider in parallel and flatten the
   * results. A rejected provider does not abort the others.
   */
  async searchAll(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const results = await Promise.allSettled(
      this.enabled().map((provider) => provider.search(query)),
    );

    return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  }
}
