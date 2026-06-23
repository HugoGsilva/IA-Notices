import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server/app.js';

describe('HTTP server (foundation)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer({ NODE_ENV: 'test', HOST: '0.0.0.0', PORT: 3000, LOG_LEVEL: 'silent' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET / returns service metadata', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.json().service).toBe('ia-notices');
  });
});
