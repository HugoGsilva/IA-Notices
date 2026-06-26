import cron, { type ScheduledTask } from 'node-cron';
import { noopLogger, type Logger } from '../logging/logger.js';

export interface SchedulerOptions {
  enabled: boolean;
  cronExpression: string;
  /** The work to run on each tick (e.g. a pipeline run). */
  task: () => Promise<unknown>;
  logger?: Logger;
}

/**
 * Thin wrapper over node-cron (see ADR 0002). Validates the expression, runs the
 * task on schedule and prevents overlapping executions: if a run is still in
 * progress when the next tick fires, the tick is skipped.
 *
 * The scheduler only triggers the task; it holds no business logic.
 */
export class PipelineScheduler {
  private readonly logger: Logger;
  private scheduled: ScheduledTask | null = null;
  private running = false;

  constructor(private readonly options: SchedulerOptions) {
    this.logger = options.logger ?? noopLogger;
  }

  /** Start the schedule when enabled and the expression is valid. */
  start(): void {
    if (!this.options.enabled) {
      this.logger.info('[scheduler] disabled — pipeline runs only on manual trigger');
      return;
    }
    if (!cron.validate(this.options.cronExpression)) {
      this.logger.error(
        `[scheduler] invalid cron expression "${this.options.cronExpression}" — not scheduling`,
      );
      return;
    }
    this.scheduled = cron.schedule(this.options.cronExpression, () => {
      void this.tick();
    });
    this.logger.info(`[scheduler] scheduled with "${this.options.cronExpression}"`);
  }

  /** Stop the schedule (no-op when not started). */
  stop(): void {
    this.scheduled?.stop();
    this.scheduled = null;
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('[scheduler] previous run still in progress — skipping this tick');
      return;
    }
    this.running = true;
    try {
      await this.options.task();
    } catch (error) {
      this.logger.error(`[scheduler] task failed: ${describeError(error)}`);
    } finally {
      this.running = false;
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
