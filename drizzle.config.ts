import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for generating and applying SQLite migrations.
 * Migrations are generated from `src/db/schema.ts` into `drizzle/`.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
