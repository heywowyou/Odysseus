import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FULL_AUDIT_PHASE_ORDER } from './full-audit-phase-order.js';

/** The two producer files held to the ordered tuple: the runner writes the
 *  analyze and report phases, the scan progress reporter writes everything
 *  from crawl to normalize. The store layer writes 'queued' at job creation
 *  and the terminal phases, so those never appear as literals here. */
const RUNNER_PATH = new URL('./run-full-audit-job.ts', import.meta.url);
const REPORTER_PATH = new URL('../report-progress.ts', import.meta.url);
const FIXTURE_PATH = new URL('../../dashboard/fixtures/full-audit-phase-order.ts', import.meta.url);
const PHASE_WRITE_PATTERN = /phase: '([a-z-]+)'/g;
const QUOTED_LITERAL_PATTERN = /'([a-z-]+)'/g;

function extractLiterals(source: string, pattern: RegExp): string[] {
  const literals: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const literal = match[1];
    if (literal !== undefined) literals.push(literal);
  }
  return literals;
}

function extractWrittenPhases(path: URL): string[] {
  return extractLiterals(readFileSync(path, 'utf8'), PHASE_WRITE_PATTERN);
}

/** The fixture is read from disk rather than imported: the interface main
 *  project is composite and excludes src/dashboard, so a static import of
 *  the fixture fails to compile (TS6307) even though vitest would run it.
 *  The slice between the two exported names covers only the pipeline
 *  tuple's own entries. */
function extractFixturePipelinePhases(): string[] {
  const source = readFileSync(FIXTURE_PATH, 'utf8');
  const pipelineBlock = source.slice(
    source.indexOf('FULL_AUDIT_PHASE_PIPELINE'),
    source.indexOf('DASHBOARD_ONLY_PHASES'),
  );
  return extractLiterals(pipelineBlock, QUOTED_LITERAL_PATTERN);
}

describe('full-audit phase order', () => {
  it('every phase the full-audit runner writes is ordered', () => {
    const written = [...extractWrittenPhases(RUNNER_PATH), ...extractWrittenPhases(REPORTER_PATH)];
    for (const phase of written) {
      expect(FULL_AUDIT_PHASE_ORDER, `phase not in the ordered tuple: ${phase}`).toContain(phase);
    }
    // The set equality is the no-gratuous-entries direction: the tuple may
    // not carry a phase the producers never write. 'queued' and 'complete'
    // count as written because the store layer writes them around these two
    // files' stages.
    expect(new Set([...written, 'queued', 'complete'])).toEqual(new Set(FULL_AUDIT_PHASE_ORDER));
  });

  it('the dashboard fixture matches the producer tuple', () => {
    expect(extractFixturePipelinePhases()).toEqual([...FULL_AUDIT_PHASE_ORDER]);
  });
});
