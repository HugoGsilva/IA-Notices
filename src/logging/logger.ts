/**
 * Minimal logger interface used by providers, the notifier and the pipeline.
 *
 * It is intentionally small and structurally compatible with Fastify's Pino
 * logger, so the real application logger can be passed directly while tests can
 * use the silent `noopLogger` or a spy.
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** A logger that discards everything. Useful as a default and in tests. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
