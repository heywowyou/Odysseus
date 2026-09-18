import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Plan 060 §16.1/§19 negative architecture proof: the migrated dashboard
 * surfaces contain no readiness/state inference from raw persistence
 * shapes. The server is the semantic boundary (plan 060 §5.3): it declares
 * the display classification (`outcomeCode`, `reportFailureStage`,
 * `coverageGateBlocked`) and the browser translates codes.
 *
 * What this forbids is exactly what the migration deleted — the client
 * classifier that read `job.status`/`awaitsInput`/`reportNotReady`
 * (commit 180444b7, issues #382/#386/#389), the failed-phase phase-list
 * mapping, and the coverage-gate error-string sniffing (issue #187) — and
 * nothing else. Presentation-only raw reads survive and are on the
 * explicit ALLOWED list below, each with its justification, so this
 * test's own scope stays auditable.
 */

const DASHBOARD = path.dirname(fileURLToPath(import.meta.url));

function dashboardSources(): { file: string; source: string }[] {
  const sources: { file: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        sources.push({ file: path.relative(DASHBOARD, full), source: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(DASHBOARD);
  return sources;
}

/** Reads of the raw fields whose interpretation moved server-side. The
 *  one exception is the wire schema: it keeps the fields as optional
 *  passthrough so an older payload still validates — declaring a shape is
 *  not inferring from it. */
const FORBIDDEN_RAW_READINESS_FIELDS = /\b(reportNotReady|awaitsInput|failedPhase)\b/;
const RAW_FIELD_SCHEMA_EXCEPTION = 'lib/api-schemas.ts';

/** No `.includes(` on an error/message string anywhere: recovery copy is
 *  chosen from the typed problem code and reason (lib/operator-copy.ts),
 *  never by sniffing exception text. */
const FORBIDDEN_ERROR_STRING_SNIFFING = /\b(err|error|message|msg)\.includes\(/;

/** The deleted client classifiers must not be resurrected client-side;
 *  these names now belong to the server payload's fields. */
const FORBIDDEN_CLIENT_CLASSIFIERS = /\bfunction\s+(displayJobStatus|reportFailureStage)\b/;

/** Raw-field reads that are presentation-only, kept deliberately. Each
 *  entry asserts the read is still present so the allowlist documents what
 *  actually renders instead of drifting into fiction. */
const ALLOWED_PRESENTATION_READS: { file: string; marker: string; why: string }[] = [
  {
    file: 'lib/api-schemas.ts',
    marker: 'reportNotReady',
    why: 'wire schema passthrough of the server payload; declaring the shape is not inference',
  },
  {
    file: 'routes/scan-progress.tsx',
    marker: 'job.status ===',
    why: 'live run-state presentation only: poll-stop via isTerminal, stop banner, URL-row links',
  },
  {
    file: 'routes/scan-progress-model.ts',
    marker: 'job.progress.',
    why: 'coverage-bar and phase-label rendering; emits no readiness or outcome verdict',
  },
  {
    file: 'routes/audits.tsx',
    marker: "summary.status === 'queued'",
    why: 'picks which server-derived cancel capability control to render (remove vs stop)',
  },
  {
    file: 'routes/audit-reports-section.tsx',
    marker: 'failure.error',
    why: 'renders the stored failure reason verbatim as technical detail; classification is server-declared',
  },
  {
    file: 'routes/audit-report-panel-model.ts',
    marker: 'describeProduceFailure',
    why: 'formats a produce failure’s technical detail for display; gates no availability, claims no readiness',
  },
];

/** The server-declared codes the migrated surfaces must actually consume;
 *  keeps this suite from passing vacuously on an empty violation list. */
const REQUIRED_SERVER_CODE_READS: { file: string; marker: string; why: string }[] = [
  {
    file: 'routes/audits-model.ts',
    marker: 'summary.outcomeCode',
    why: 'the Audits list shows the server classification verbatim',
  },
  {
    file: 'routes/scan-progress-model.ts',
    marker: 'job.outcomeCode',
    why: 'the terminal card kind reads the server classification',
  },
  {
    file: 'routes/scan-progress.tsx',
    marker: 'job.coverageGateBlocked',
    why: 'the coverage-gate recovery link is the typed field, not message matching',
  },
  {
    file: 'routes/scan-progress.tsx',
    marker: 'job.reportFailureStage',
    why: 'the report-issue card names the stage the server declared',
  },
  {
    file: 'lib/api-schemas.ts',
    marker: 'outcomeCode',
    why: 'a regressing server fails the runtime schema loudly',
  },
];

describe('migrated surfaces do not infer readiness from raw persistence shapes (plan 060 §16.1)', () => {
  const sources = dashboardSources();

  it('scans the dashboard sources', () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  it('reads no raw readiness field outside the wire schema', () => {
    const violations = sources
      .filter(({ file }) => file !== RAW_FIELD_SCHEMA_EXCEPTION)
      .filter(({ source }) => FORBIDDEN_RAW_READINESS_FIELDS.test(source))
      .map(({ file }) => file);
    expect(
      violations,
      'The dashboard must consume the server-declared classification ' +
        '(outcomeCode, reportFailureStage, snapshot readiness), not these raw fields',
    ).toEqual([]);
  });

  it('sniffs no error or message string', () => {
    const violations = sources
      .filter(({ source }) => FORBIDDEN_ERROR_STRING_SNIFFING.test(source))
      .map(({ file }) => file);
    expect(
      violations,
      'Recovery copy comes from the typed problem code (lib/operator-copy.ts); ' +
        'error-string matching reappeared in these files',
    ).toEqual([]);
  });

  it('does not resurrect the deleted client classifiers', () => {
    const violations = sources
      .filter(({ source }) => FORBIDDEN_CLIENT_CLASSIFIERS.test(source))
      .map(({ file }) => file);
    expect(
      violations,
      'displayJobStatus/reportFailureStage are server-owned fields now; ' +
        'a client classifier reappeared in these files',
    ).toEqual([]);
  });

  it('keeps exactly the documented presentation-only raw reads', () => {
    for (const { file, marker, why } of ALLOWED_PRESENTATION_READS) {
      const source = sources.find((entry) => entry.file === file);
      expect(source, `the ALLOWED entry's file disappeared: ${file}`).toBeDefined();
      expect(
        source?.source.includes(marker),
        `the justified read "${marker}" is gone from ${file}; update the ALLOWED list (${why})`,
      ).toBe(true);
    }
  });

  it('still consumes the server-declared codes, so the bans above are not vacuous', () => {
    for (const { file, marker, why } of REQUIRED_SERVER_CODE_READS) {
      const source = sources.find((entry) => entry.file === file);
      expect(source, `required consumer missing: ${file}`).toBeDefined();
      expect(source?.source.includes(marker), `${file} must keep reading ${marker}: ${why}`).toBe(
        true,
      );
    }
  });
});
