import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated application configuration.
 *
 * All environment access happens here so the rest of the codebase depends on a
 * typed, validated `config` object instead of reaching into `process.env`.
 *
 * Defaults are safe: nothing that activates real delivery (Discord) or exposes
 * the system is enabled without explicit configuration.
 */

/** Coerce common truthy/falsy env strings into a boolean. */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

/**
 * Wrap a schema so empty/whitespace-only env values are treated as absent.
 * Compose/Swarm env blocks commonly inject `VAR=` (an empty string) for unset
 * optionals via `${VAR:-}`, which would otherwise fail an optional/`min(1)`
 * check and crash startup.
 */
const emptyAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );

/** Parse a comma-separated list into a trimmed, non-empty string array. */
const csvList = (defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

const envSchema = z.object({
  // --- Runtime / server -----------------------------------------------------
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // --- HTTP client ----------------------------------------------------------
  // Generous timeout/retries: some sources (e.g. GDELT) are slow and flaky.
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(20000),
  HTTP_RETRIES: z.coerce.number().int().min(0).max(5).default(3),

  // --- Database -------------------------------------------------------------
  DATABASE_PATH: z.string().min(1).default('data/ia-notices.sqlite'),

  // --- Providers ------------------------------------------------------------
  NEWSAPI_ENABLED: booleanFromEnv(false),
  NEWSAPI_KEY: emptyAsUnset(z.string().optional()),
  GDELT_ENABLED: booleanFromEnv(false),
  GUARDIAN_ENABLED: booleanFromEnv(false),
  GUARDIAN_KEY: emptyAsUnset(z.string().optional()),
  // Hacker News (Algolia search) — no key; a developer-focused source.
  HACKERNEWS_ENABLED: booleanFromEnv(false),
  // Minimum HN points for a story to be surfaced. A relevance/quality gate:
  // higher = stricter (fewer, more notable stories). Tune without a rebuild.
  HACKERNEWS_MIN_POINTS: z.coerce.number().int().min(0).default(30),
  // Reddit (public JSON listings) — no key; developer/AI communities.
  REDDIT_ENABLED: booleanFromEnv(false),
  REDDIT_SUBREDDITS: csvList('LocalLLaMA,MachineLearning,ChatGPTCoding,ClaudeAI,OpenAI,artificial'),
  // Minimum upvotes for a Reddit post to be surfaced (quality gate).
  REDDIT_MIN_UPVOTES: z.coerce.number().int().min(0).default(25),
  // Reddit "top" listing window: hour | day | week | month | year | all.
  REDDIT_LISTING: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).default('day'),
  // Hugging Face daily papers — no key; curated new papers/models.
  HUGGINGFACE_ENABLED: booleanFromEnv(false),
  // RSS/Atom feeds of official AI blogs — no key; feed list is tunable here.
  RSS_ENABLED: booleanFromEnv(false),
  RSS_FEEDS: csvList(
    'https://huggingface.co/blog/feed.xml,' +
      'https://openai.com/news/rss.xml,' +
      'https://blog.google/technology/ai/rss/,' +
      'https://deepmind.google/blog/rss.xml',
  ),

  // --- Curation -------------------------------------------------------------
  // Defaults tuned for developer/AI news. Ordered deliberately:
  //  - The FIRST terms are specific, low-ambiguity search queries: per-keyword
  //    sources (e.g. Hacker News) only spend their request budget on the lead.
  //  - The TAIL broadens *scoring* coverage with general AI/ML vocabulary, so
  //    items from already-curated AI sources (Reddit, Hugging Face, AI blogs)
  //    reliably match the scorer without that vocabulary polluting the searches.
  // Ambiguous bare model names (Claude/Gemini/Mistral — also a person, a zodiac
  // sign, a wind) sit at the tail too. Whole-word matched, so short distinctive
  // terms are safe. Override via NEWS_KEYWORDS to taste.
  NEWS_KEYWORDS: csvList(
    'LLM,GPT-5,AI agent,open source model,fine-tuning,coding assistant,Hugging Face,' +
      'language model,model release,open weights,prompt engineering,multimodal,RAG,' +
      'machine learning,neural network,transformer,diffusion,reasoning,quantization,' +
      'inference,embeddings,benchmark,GPT-4o,Claude,Gemini,Llama,DeepSeek,Mistral,' +
      'Qwen,Copilot,AI',
  ),
  NEWS_LANGUAGE: z.string().min(2).max(5).default('en'),
  NEWS_LOOKBACK_HOURS: z.coerce.number().int().positive().max(720).default(48),
  NEWS_MAX_ITEMS: z.coerce.number().int().positive().max(200).default(20),
  // With whole-word matching, a single title hit on a specific keyword (=2) is
  // already high signal, so 2 is the inclusive-but-clean default.
  NEWS_MIN_SCORE: z.coerce.number().min(0).default(2),

  // --- Discord delivery -----------------------------------------------------
  DISCORD_ENABLED: booleanFromEnv(false),
  DISCORD_WEBHOOK_URL: emptyAsUnset(z.string().url().optional()),

  // --- Scheduling -----------------------------------------------------------
  SCHEDULE_ENABLED: booleanFromEnv(false),
  SCHEDULE_CRON: z.string().min(1).default('0 * * * *'),

  // --- Admin ----------------------------------------------------------------
  ADMIN_TOKEN: emptyAsUnset(z.string().min(1).optional()),
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
