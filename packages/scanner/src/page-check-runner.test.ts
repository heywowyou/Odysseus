import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import {
  checkFields,
  defineCheck,
  PageCheckRunner,
  type ResultDraft,
} from './page-check-runner.js';
import { RENDERED_PAGE_CHECKS } from './rendered-page-checks.js';

/** A page that answers the runner's responsiveness probe, or not. */
function fakePage(responsive = true): Page {
  return {
    isClosed: () => false,
    evaluate: () => (responsive ? Promise.resolve(true) : new Promise(() => undefined)),
  } as unknown as Page;
}

const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

describe('PageCheckRunner (issue #570)', () => {
  it('records outcomes, values and errors in the registry fields', async () => {
    const runner = new PageCheckRunner({ perCheckBudgetMs: 1_000 });
    const result: ResultDraft = { url: 'https://hotel.example/' };
    await runner.runChecks(
      [
        defineCheck({
          id: 'mixed-content',
          field: 'mixedContent',
          budget: 'check',
          posture: 'error-field',
          run: async () => ({ pageUrl: 'https://hotel.example/', resources: [] }) as never,
        }),
        defineCheck({
          id: 'alt-text',
          field: 'altText',
          budget: 'check',
          posture: 'error-field',
          run: async () => {
            throw new Error('evaluate failed');
          },
        }),
        defineCheck({
          id: 'nap-consistency',
          field: 'napConsistency',
          budget: 'check',
          posture: 'best-effort',
          applies: () => false,
          run: async () => undefined,
        }),
      ],
      fakePage(),
      result.url,
      result,
      undefined,
    );

    expect(runner.outcomes).toEqual({
      'mixed-content': 'completed',
      'alt-text': 'failed',
      'nap-consistency': 'not-applicable',
    });
    expect(result.mixedContent).toBeDefined();
    expect(result.altTextError).toBe('evaluate failed');
    expect(result.altText).toBeUndefined();
  });

  it('stores a best-effort fallback and records no outcome for an untracked pass', async () => {
    const runner = new PageCheckRunner({ perCheckBudgetMs: 1_000 });
    const result: ResultDraft = { url: 'https://hotel.example/' };
    await runner.runChecks(
      [
        defineCheck({
          id: 'transactional-flow-evidence',
          field: 'transactionalFlowEvidence',
          budget: 'check',
          posture: 'best-effort',
          run: async () => {
            throw new Error('detector crashed');
          },
          fallback: () => [],
        }),
        defineCheck({
          id: 'frames',
          field: 'frames',
          budget: 'check',
          posture: 'untracked',
          run: async () => {
            throw new Error('frames unavailable');
          },
        }),
      ],
      fakePage(),
      result.url,
      result,
      undefined,
    );

    expect(runner.outcomes).toEqual({ 'transactional-flow-evidence': 'failed' });
    expect(result.transactionalFlowEvidence).toEqual([]);
    expect(result).not.toHaveProperty('frames');
    expect(result).not.toHaveProperty('transactionalFlowEvidenceError');
  });

  it('fails only the check that exceeds its budget while the page still answers', async () => {
    const runner = new PageCheckRunner({ perCheckBudgetMs: 20 });
    const result: ResultDraft = { url: 'https://hotel.example/' };
    await runner.runChecks(
      [
        defineCheck({
          id: 'video-captions',
          field: 'videoCaptions',
          budget: 'check',
          posture: 'error-field',
          run: () => never(),
        }),
        defineCheck({
          id: 'structured-data',
          field: 'structuredData',
          budget: 'check',
          posture: 'error-field',
          run: async () => ({ blocks: [] }) as never,
        }),
      ],
      fakePage(),
      result.url,
      result,
      undefined,
    );

    expect(result.videoCaptionsError).toMatch(/check-timeout: video-captions exceeded 20ms/u);
    expect(runner.outcomes['structured-data']).toBe('completed');
  });

  it('abandons the rest of the page once a timed-out check leaves it unresponsive', async () => {
    let closed = false;
    const runner = new PageCheckRunner({
      perCheckBudgetMs: 20,
      closeAll: async () => {
        closed = true;
      },
    });
    const result: ResultDraft = { url: 'https://hotel.example/' };
    await runner.runChecks(
      [
        defineCheck({
          id: 'video-captions',
          field: 'videoCaptions',
          budget: 'check',
          posture: 'error-field',
          run: () => never(),
        }),
        defineCheck({
          id: 'structured-data',
          field: 'structuredData',
          budget: 'check',
          posture: 'error-field',
          run: async () => ({ blocks: [] }) as never,
        }),
      ],
      fakePage(false),
      result.url,
      result,
      undefined,
    );

    expect(runner.outcomes['structured-data']).toBe('failed');
    expect(result.structuredDataError).toMatch(/check-timeout: video-captions/u);
    expect(closed).toBe(true);
  });

  it('records a value that could not conclude as failed', async () => {
    const runner = new PageCheckRunner({ perCheckBudgetMs: 1_000 });
    const result: ResultDraft = { url: 'https://hotel.example/' };
    await runner.runChecks(
      [
        defineCheck({
          id: 'reflow',
          field: 'reflow',
          budget: 'mutating',
          posture: 'best-effort',
          run: async () => ({ checked: false }) as never,
          concluded: (value) => value.checked,
        }),
      ],
      fakePage(),
      result.url,
      result,
      undefined,
    );
    expect(runner.outcomes.reflow).toBe('failed');
    expect(result.reflow).toEqual({ checked: false });
  });

  it('declares every rendered check against the registry it reports to', () => {
    for (const check of RENDERED_PAGE_CHECKS) expect(() => checkFields(check)).not.toThrow();
  });
});
