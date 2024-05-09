import { describe, expect, test } from 'vitest';
import { Context } from './context.js';

describe('Context', () => {
  test('Times out', async () => {
    const timeoutMs = 10;
    const { ctx } = Context.new('Timeout', { timeoutMs });
    expect(ctx.cancelled).toEqual(false);
    await wait(timeoutMs + 1);
    expect(ctx.cancelled).toEqual(true);
    if (ctx.isCancelled()) {
      expect(ctx.cancellation.reason).toContain('timeout');
      expect(ctx.cancellation.reason).toContain(String(timeoutMs));
    }
  });

  test('Fails after maxRetries', async () => {
    const maxRetries = 3;
    const { ctx } = Context.new('Timeout', { maxRetries });
    // Accept 3 retries
    expect(ctx.cancelled).toEqual(false);
    ctx.failure();
    expect(ctx.cancelled).toEqual(false);
    ctx.failure();
    expect(ctx.cancelled).toEqual(false);
    // Reset retry counter
    ctx.reset();
    ctx.failure();
    ctx.failure();
    expect(ctx.cancelled).toEqual(false);
    // Additional retry should breach limit
    ctx.failure();
    expect(ctx.cancelled).toEqual(true);
    // Reset should have no effect once cancelled
    ctx.reset();
    expect(ctx.cancelled).toEqual(true);
    if (ctx.isCancelled()) {
      expect(ctx.cancellation.reason).toContain('maxRetries');
      expect(ctx.cancellation.reason).toContain(String(maxRetries));
    }
  });

  test('Parent cancels child', async () => {
    const { ctx: parentCtx, cancel } = Context.new('Parent');
    const { ctx } = Context.from(parentCtx, 'Child');
    expect(parentCtx.cancelled).toEqual(false);
    expect(ctx.cancelled).toEqual(false);
    cancel();
    expect(parentCtx.cancelled).toEqual(true);
    expect(ctx.cancelled).toEqual(true);
    if (ctx.isCancelled()) {
      expect(ctx.cancellation.cancelledPath).toEqual(parentCtx.path);
    }
    if (parentCtx.isCancelled()) {
      expect(parentCtx.cancellation.cancelledPath).toEqual(parentCtx.path);
    }
  });

  test('Child does not cancel parent', async () => {
    const { ctx: parentCtx } = Context.new('Parent');
    const { ctx, cancel } = Context.from(parentCtx, 'Child');
    expect(parentCtx.cancelled).toEqual(false);
    expect(ctx.cancelled).toEqual(false);
    cancel();
    expect(parentCtx.cancelled).toEqual(false);
    expect(ctx.cancelled).toEqual(true);
    if (ctx.isCancelled()) {
      expect(ctx.cancellation.cancelledPath).toEqual(ctx.path);
    }
  });

  test('Can wait', async () => {
    const { ctx, cancel } = Context.new('Wait');
    const cancelled = ctx.wait();
    cancel('foo');
    const cancellation = await cancelled;
    expect(cancellation.reason).toEqual('foo');
  });

  test('Can wait wrapped', async () => {
    const { ctx: grandparent } = Context.new('Wait0');
    const { ctx: parent, cancel } = Context.from(grandparent, 'Wait1');
    const { ctx: child1 } = Context.from(parent, 'Wait2');
    const { ctx: child2 } = Context.from(parent, 'Wait2');
    const childCancelled = child1.wait();
    cancel('foo');
    const cancellation = await childCancelled;
    await parent.wait();
    await child2.wait();
    expect(cancellation.reason).toEqual('foo');
    expect(grandparent.isCancelled()).toBeFalsy();
  });

  test('Escapes backoff when cancelled', async () => {
    const { ctx, cancel } = Context.new('Backoff', { baseBackoffMs: 100_000 });
    const [start] = process.hrtime();
    // Start long backoff
    const backoff = ctx.backoff();
    // Cancelling should resolve backoff promise
    cancel('Backoff');
    await backoff;
    const [finish] = process.hrtime();
    expect(finish - start).toBeLessThan(10_000);
  });
});

function wait(waitMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}
