import { getConfig } from './config/env.js';
import { createDb } from './db/client.js';
import { NewsRepository } from './db/repository.js';
import { DiscordWebhookNotifier } from './discord/webhook-notifier.js';
import { HttpClient } from './http/client.js';
import { runPipeline } from './pipeline/run.js';
import { ProviderRegistry } from './providers/registry.js';
import { PipelineScheduler } from './scheduler/scheduler.js';
import { buildServer } from './server/app.js';

/**
 * Application entrypoint. Composes the pipeline dependencies, exposes the HTTP
 * layer (healthcheck + protected manual trigger), starts the scheduler and
 * wires graceful shutdown.
 */
async function main(): Promise<void> {
  const config = getConfig();

  const db = createDb(config.DATABASE_PATH);
  const repository = new NewsRepository(db);
  const httpClient = new HttpClient({
    timeoutMs: config.HTTP_TIMEOUT_MS,
    retries: config.HTTP_RETRIES,
  });

  // The HTTP server owns the logger; build it first so providers/notifier log
  // through the same Pino instance.
  const registry = ProviderRegistry.fromConfig(config);
  const notifier = new DiscordWebhookNotifier({
    enabled: config.DISCORD_ENABLED,
    webhookUrl: config.DISCORD_WEBHOOK_URL,
    http: httpClient,
  });

  const app = buildServer(config, {
    runPipeline: () => runPipeline({ config, registry, repository, notifier, logger: app.log }),
  });

  const scheduler = new PipelineScheduler({
    enabled: config.SCHEDULE_ENABLED,
    cronExpression: config.SCHEDULE_CRON,
    task: () => runPipeline({ config, registry, repository, notifier, logger: app.log }),
    logger: app.log,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    scheduler.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    scheduler.start();
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
