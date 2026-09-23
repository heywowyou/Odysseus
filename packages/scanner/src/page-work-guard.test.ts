import { describe, expect, it, vi } from 'vitest';
import type { BrowserContext } from 'playwright';
import {
  createPageWorkGuard,
  PageWorkDeadlineError,
  withPageWorkDeadline,
} from './page-work-guard.js';

function fakeContext(closeImpl: () => Promise<void> = () => Promise.resolve()): BrowserContext {
  return { close: vi.fn(closeImpl) } as unknown as BrowserContext;
}

describe('createPageWorkGuard', () => {
  it('closes a stalled mobile surface context when its deadline expires', async () => {
    let rejectEvaluate!: (error: Error) => void;
    const context = fakeContext(() => {
      rejectEvaluate(new Error('target closed'));
      return Promise.resolve();
    });
    const guard = createPageWorkGuard();
    guard.track(context);
    const evaluate = new Promise<never>((_resolve, reject) => {
      rejectEvaluate = reject;
    });

    await expect(
      withPageWorkDeadline('mobile surface evaluate', evaluate, 5, guard),
    ).rejects.toBeInstanceOf(PageWorkDeadlineError);

    expect(context.close).toHaveBeenCalledOnce();
  });

  it('closes every tracked context and clears its own set', async () => {
    const guard = createPageWorkGuard();
    const a = fakeContext();
    const b = fakeContext();
    guard.track(a);
    guard.track(b);

    await guard.closeAll();

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);

    // A second closeAll has nothing left to close.
    await guard.closeAll();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('closes contexts tracked after closeAll has completed', async () => {
    const guard = createPageWorkGuard();
    await guard.closeAll();

    const late = fakeContext();
    guard.track(late);

    expect(late.close).toHaveBeenCalledTimes(1);
  });

  it('does not close an untracked context', async () => {
    const guard = createPageWorkGuard();
    const a = fakeContext();
    guard.track(a);
    guard.untrack(a);

    await guard.closeAll();

    expect(a.close).not.toHaveBeenCalled();
  });

  it('swallows a context whose close() rejects', async () => {
    const guard = createPageWorkGuard();
    const failing = fakeContext(() => Promise.reject(new Error('already closed')));
    guard.track(failing);

    await expect(guard.closeAll()).resolves.toBeUndefined();
    expect(failing.close).toHaveBeenCalledTimes(1);
  });

  it('mirrors track/untrack into a parent guard', async () => {
    const parent = createPageWorkGuard();
    const child = createPageWorkGuard(parent);
    const a = fakeContext();

    child.track(a);
    // The parent's own closeAll must reach a context tracked only through
    // the child - this is what lets scan-site.ts's run-wide guard close
    // everything on cancellation, including contexts a per-page guard is
    // still holding.
    await parent.closeAll();
    expect(a.close).toHaveBeenCalledTimes(1);
  });

  it('removes from the parent when a child untracks', async () => {
    const parent = createPageWorkGuard();
    const child = createPageWorkGuard(parent);
    const a = fakeContext();

    child.track(a);
    child.untrack(a);

    await parent.closeAll();
    expect(a.close).not.toHaveBeenCalled();
  });
});
