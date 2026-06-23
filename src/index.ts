import { getConfig } from './config/env.js';
import { buildServer } from './server/app.js';

/**
 * Application entrypoint. Boots the HTTP server and wires graceful shutdown.
 *
 * Foundation stage: starts only the HTTP layer. Scheduler, pipeline and Discord
 * delivery are added in later steps.
 */
async function main(): Promise<void> {
  const config = getConfig();
  const app = buildServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
