import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validate = vi.fn((_expression: string) => true);
const schedule = vi.fn((_expression: string, _task: () => void) => ({ stop: vi.fn() }));

vi.mock('node-cron', () => ({
  default: { validate, schedule },
}));

// Imported after the mock is registered.
const { PipelineScheduler } = await import('../../src/scheduler/scheduler.js');
const { noopLogger } = await import('../../src/logging/logger.js');

beforeEach(() => {
  validate.mockReturnValue(true);
  schedule.mockReturnValue({ stop: vi.fn() });
});

afterEach(() => vi.clearAllMocks());

describe('PipelineScheduler', () => {
  it('does not schedule when disabled', () => {
    new PipelineScheduler({
      enabled: false,
      cronExpression: '0 * * * *',
      task: async () => {},
    }).start();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not schedule an invalid expression', () => {
    validate.mockReturnValue(false);
    const error = vi.fn();
    new PipelineScheduler({
      enabled: true,
      cronExpression: 'nonsense',
      task: async () => {},
      logger: { ...noopLogger, error },
    }).start();
    expect(schedule).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('schedules when enabled and valid', () => {
    new PipelineScheduler({
      enabled: true,
      cronExpression: '0 * * * *',
      task: async () => {},
    }).start();
    expect(schedule).toHaveBeenCalledOnce();
  });

  it('skips overlapping ticks while a run is in progress', async () => {
    let resolveTask: (() => void) | undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTask = resolve;
        }),
    );
    new PipelineScheduler({ enabled: true, cronExpression: '* * * * *', task }).start();

    // The scheduled callback is what cron would invoke on each tick.
    const tick = schedule.mock.calls[0]![1] as () => void;

    tick(); // starts the (still pending) task
    tick(); // should be skipped because the first is in flight
    expect(task).toHaveBeenCalledOnce();

    resolveTask?.();
    await Promise.resolve();
    await Promise.resolve();

    tick(); // now allowed again
    expect(task).toHaveBeenCalledTimes(2);
  });
});
