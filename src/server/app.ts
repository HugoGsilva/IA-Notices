import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { RunSummary } from '../pipeline/run.js';

export interface ServerDeps {
  /** Triggers a single pipeline run. When provided, the protected manual
   * endpoint is exposed at POST /internal/run. */
  runPipeline?: () => Promise<RunSummary>;
}

/**
 * Build the Fastify HTTP server.
 *
 * Exposes service metadata and a healthcheck always, and — when a runner is
 * provided — a protected manual trigger guarded by ADMIN_TOKEN.
 */
export function buildServer(config: AppConfig, deps: ServerDeps = {}): FastifyInstance {
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

  if (deps.runPipeline) {
    registerManualRun(app, config, deps.runPipeline);
  }

  return app;
}

/** POST /internal/run — protected by a constant-time admin token check. */
function registerManualRun(
  app: FastifyInstance,
  config: AppConfig,
  runPipeline: () => Promise<RunSummary>,
): void {
  app.post('/internal/run', async (request, reply) => {
    if (!config.ADMIN_TOKEN) {
      // No token configured: the admin surface is unavailable, not open.
      return reply.code(503).send({ error: 'admin endpoint not configured' });
    }
    if (!isAuthorized(request, config.ADMIN_TOKEN)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    try {
      const summary = await runPipeline();
      return reply.code(200).send({ status: 'ok', summary });
    } catch {
      // Never leak internal/provider details to the caller.
      return reply.code(500).send({ error: 'pipeline run failed' });
    }
  });
}

/** Extract a bearer token and compare it to the admin token in constant time. */
function isAuthorized(request: FastifyRequest, adminToken: string): boolean {
  const header = request.headers.authorization;
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const presented = match?.[1];
  if (!presented) return false;
  return constantTimeEquals(presented, adminToken);
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
