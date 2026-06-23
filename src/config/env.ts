import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated application configuration.
 *
 * All environment access happens here so the rest of the codebase depends on a
 * typed, validated `config` object instead of reaching into `process.env`.
 *
 * Foundation stage: only runtime/server variables are defined. Provider keys,
 * Discord webhook and curation/scheduling settings are added in later steps.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

/**
 * Parse and validate the environment. Throws a readable error if validation
 * fails so misconfiguration is caught at startup.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Lazily load and cache the validated configuration. */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/** Reset the cached configuration — primarily useful for tests. */
export function resetConfigCache(): void {
  cachedConfig = null;
}
