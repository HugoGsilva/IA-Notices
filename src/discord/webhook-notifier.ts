import type { NewsItem, NotifyResult, Notifier } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';
import { buildDigest } from '../pipeline/digest.js';

const NOTIFIER_NAME = 'discord-webhook';

export interface DiscordWebhookOptions {
  enabled: boolean;
  webhookUrl?: string;
  http: HttpClient;
  logger?: Logger;
  /** Optional cap on embeds per message (Discord allows at most 10). */
  maxEmbeds?: number;
}

/**
 * Delivers a curated digest to a Discord channel via the official Webhook.
 *
 * The webhook URL is a secret: it is read only from configuration and is NEVER
 * logged — not even masked, since the path contains the webhook id/token. A
 * disabled notifier (flag off or URL missing) is a safe no-op.
 */
export class DiscordWebhookNotifier implements Notifier {
  readonly name = NOTIFIER_NAME;
  readonly enabled: boolean;
  private readonly webhookUrl: string;
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly maxEmbeds: number | undefined;

  constructor(options: DiscordWebhookOptions) {
    this.webhookUrl = options.webhookUrl ?? '';
    this.enabled = options.enabled && this.webhookUrl.length > 0;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
    this.maxEmbeds = options.maxEmbeds;
  }

  async notify(items: NewsItem[]): Promise<NotifyResult> {
    if (!this.enabled) {
      this.logger.debug(`[${NOTIFIER_NAME}] disabled — skipping delivery`);
      return { delivered: false, itemCount: 0 };
    }

    const digest = buildDigest(items, { maxEmbeds: this.maxEmbeds });
    if (!digest) {
      this.logger.debug(`[${NOTIFIER_NAME}] nothing to deliver`);
      return { delivered: false, itemCount: 0 };
    }

    try {
      await this.http.request(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(digest),
      });
      this.logger.info(`[${NOTIFIER_NAME}] delivered ${digest.embeds.length} items`);
      return { delivered: true, itemCount: digest.embeds.length };
    } catch (error) {
      // Never include the webhook URL in the log line.
      this.logger.warn(`[${NOTIFIER_NAME}] delivery failed: ${describeError(error)}`);
      return { delivered: false, itemCount: 0 };
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
