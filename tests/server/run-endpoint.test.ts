import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server/app.js';
import { loadConfig } from '../../src/config/env.js';
import type { RunSummary } from '../../src/pipeline/run.js';

const summary: RunSummary = { fetched: 3, kept: 2, inserted: 2, delivered: 2 };
const TOKEN = 'super-secret-admin-token';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(
  envOverrides: Record<string, string>,
  runPipeline?: () => Promise<RunSummary>,
): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...envOverrides });
  app = buildServer(config, { runPipeline });
  await app.ready();
  return app;
}

describe('POST /internal/run', () => {
  it('rejects with 401 when no token is presented', async () => {
    const server = await build({ ADMIN_TOKEN: TOKEN }, async () => summary);
    const res = await server.inject({ method: 'POST', url: '/internal/run' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects with 401 when the token is wrong', async () => {
    const server = await build({ ADMIN_TOKEN: TOKEN }, async () => summary);
    const res = await server.inject({
      method: 'POST',
      url: '/internal/run',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('runs the pipeline with the correct token', async () => {
    const runPipeline = vi.fn(async () => summary);
    const server = await build({ ADMIN_TOKEN: TOKEN }, runPipeline);
    const res = await server.inject({
      method: 'POST',
      url: '/internal/run',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', summary });
    expect(runPipeline).toHaveBeenCalledOnce();
  });

  it('returns 503 when no admin token is configured', async () => {
    const server = await build({}, async () => summary);
    const res = await server.inject({
      method: 'POST',
      url: '/internal/run',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 without leaking details when the run throws', async () => {
    const server = await build({ ADMIN_TOKEN: TOKEN }, async () => {
      throw new Error('provider exploded with secret-key');
    });
    const res = await server.inject({
      method: 'POST',
      url: '/internal/run',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.json())).not.toContain('secret-key');
  });

  it('is not registered when no runner is provided', async () => {
    const server = await build({ ADMIN_TOKEN: TOKEN });
    const res = await server.inject({
      method: 'POST',
      url: '/internal/run',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
