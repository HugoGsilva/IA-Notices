import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Build the Fastify HTTP server.
 *
 * Foundation stage: exposes only service metadata and a healthcheck. Business
 * endpoints (e.g. the protected manual run trigger) are added in later steps.
 */
export function buildServer(config: AppConfig): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  app.get('/', async () => ({
    service: 'ia-notices',
    status: 'ok',
    stage: 'foundation',
  }));

  app.get('/health', async () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  return app;
}
