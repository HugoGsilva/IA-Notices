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

  it('keeps delivery, providers and scheduler disabled by default', () => {
    const config = loadConfig({});
    expect(config.NEWSAPI_ENABLED).toBe(false);
    expect(config.GDELT_ENABLED).toBe(false);
    expect(config.HACKERNEWS_ENABLED).toBe(false);
    expect(config.DISCORD_ENABLED).toBe(false);
    expect(config.SCHEDULE_ENABLED).toBe(false);
    expect(config.ADMIN_TOKEN).toBeUndefined();
  });

  it('parses boolean flags from common string forms', () => {
    expect(loadConfig({ NEWSAPI_ENABLED: 'true' }).NEWSAPI_ENABLED).toBe(true);
    expect(loadConfig({ GDELT_ENABLED: '1' }).GDELT_ENABLED).toBe(true);
    expect(loadConfig({ DISCORD_ENABLED: 'yes' }).DISCORD_ENABLED).toBe(true);
    expect(loadConfig({ SCHEDULE_ENABLED: 'off' }).SCHEDULE_ENABLED).toBe(false);
  });

  it('parses NEWS_KEYWORDS into a trimmed list', () => {
    const config = loadConfig({ NEWS_KEYWORDS: ' AI , LLM ,, robotics ' });
    expect(config.NEWS_KEYWORDS).toEqual(['AI', 'LLM', 'robotics']);
  });

  it('applies curation and http defaults', () => {
    const config = loadConfig({});
    expect(config.NEWS_LANGUAGE).toBe('en');
    expect(config.NEWS_LOOKBACK_HOURS).toBe(24);
    expect(config.NEWS_MAX_ITEMS).toBe(20);
    expect(config.NEWS_MIN_SCORE).toBe(1);
    expect(config.HTTP_TIMEOUT_MS).toBe(10000);
    expect(config.HTTP_RETRIES).toBe(2);
    expect(config.DATABASE_PATH).toBe('data/ia-notices.sqlite');
  });

  it('rejects a malformed Discord webhook URL', () => {
    expect(() => loadConfig({ DISCORD_WEBHOOK_URL: 'not-a-url' })).toThrow(/DISCORD_WEBHOOK_URL/);
  });

  it('treats empty-string optionals as unset (compose ${VAR:-} default)', () => {
    const config = loadConfig({
      ADMIN_TOKEN: '',
      NEWSAPI_KEY: '',
      GUARDIAN_KEY: '   ',
      DISCORD_WEBHOOK_URL: '',
    });
    expect(config.ADMIN_TOKEN).toBeUndefined();
    expect(config.NEWSAPI_KEY).toBeUndefined();
    expect(config.GUARDIAN_KEY).toBeUndefined();
    expect(config.DISCORD_WEBHOOK_URL).toBeUndefined();
  });
});
