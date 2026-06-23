import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('applies safe defaults when variables are absent', () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('coerces and accepts valid overrides', () => {
    const config = loadConfig({ NODE_ENV: 'production', PORT: '8080', LOG_LEVEL: 'debug' });
    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe('debug');
  });

  it('throws a readable error for invalid values', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(/Invalid environment configuration/);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
