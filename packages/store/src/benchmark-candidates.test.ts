import { afterAll, describe, expect, it } from 'vitest';
import {
  seedBenchmarkCandidates,
  listBenchmarkCandidates,
  listPendingBenchmarkCandidates,
  recordBenchmarkCandidateOutcome,
  getBenchmarkQualificationSummary,
} from './benchmark-candidates.js';
import { createBenchmarkCandidateModel } from './schemas/benchmark-candidate.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('benchmark candidates', () => {
  it('seeds a candidate list once and is idempotent on a second call', async () => {
    const cohortVersion = `test-seed-${Date.now()}`;
    const candidates = [
      { rank: 1, domain: 'a.example' },
      { rank: 2, domain: 'b.example' },
    ];

    await seedBenchmarkCandidates(connection!, cohortVersion, candidates);
    await seedBenchmarkCandidates(connection!, cohortVersion, candidates);

    const rows = await listBenchmarkCandidates(connection!, cohortVersion);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(['pending', 'pending']);
  });

  it('does not overwrite a candidate that already reached a terminal status', async () => {
    const cohortVersion = `test-resume-${Date.now()}`;
    await seedBenchmarkCandidates(connection!, cohortVersion, [{ rank: 1, domain: 'a.example' }]);
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'a.example', {
      resolvedHost: 'a.example',
      status: 'qualified',
      reasons: [],
      fetchFailureReason: null,
      siren: '732829320',
      denomination: 'Example SAS',
      naf: '47.91A',
    });

    // Re-seeding (as a restart would do) must not reset the decided row.
    await seedBenchmarkCandidates(connection!, cohortVersion, [{ rank: 1, domain: 'a.example' }]);

    const rows = await listBenchmarkCandidates(connection!, cohortVersion);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('qualified');
    expect(rows[0]?.siren).toBe('732829320');
  });

  it('lists only pending candidates for resume, excluding terminal statuses', async () => {
    const cohortVersion = `test-pending-${Date.now()}`;
    await seedBenchmarkCandidates(connection!, cohortVersion, [
      { rank: 1, domain: 'qualified.example' },
      { rank: 2, domain: 'disqualified.example' },
      { rank: 3, domain: 'still-pending.example' },
    ]);
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'qualified.example', {
      resolvedHost: 'qualified.example',
      status: 'qualified',
      reasons: [],
      fetchFailureReason: null,
      siren: '732829320',
      denomination: 'Example SAS',
      naf: '47.91A',
    });
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'disqualified.example', {
      resolvedHost: 'disqualified.example',
      status: 'disqualified',
      reasons: ['no-siren-extracted'],
      fetchFailureReason: null,
      siren: null,
      denomination: null,
      naf: null,
    });

    const pending = await listPendingBenchmarkCandidates(connection!, cohortVersion);
    expect(pending.map((row) => row.domain)).toEqual(['still-pending.example']);
  });

  it('summarizes cumulative outcomes by status, by reason, and by fetch-failure reason', async () => {
    const cohortVersion = `test-summary-${Date.now()}`;
    await seedBenchmarkCandidates(connection!, cohortVersion, [
      { rank: 1, domain: 'qualified.example' },
      { rank: 2, domain: 'disqualified.example' },
      { rank: 3, domain: 'robots-blocked.example' },
      { rank: 4, domain: 'unreachable.example' },
    ]);
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'qualified.example', {
      resolvedHost: 'qualified.example',
      status: 'qualified',
      reasons: [],
      fetchFailureReason: null,
      siren: '732829320',
      denomination: 'Example SAS',
      naf: '47.91A',
    });
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'disqualified.example', {
      resolvedHost: 'disqualified.example',
      status: 'disqualified',
      reasons: ['no-siren-extracted', 'domain-suppressed'],
      fetchFailureReason: null,
      siren: null,
      denomination: null,
      naf: null,
    });
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'robots-blocked.example', {
      resolvedHost: null,
      status: 'fetch-failed',
      reasons: [],
      fetchFailureReason: 'robots-disallowed',
      siren: null,
      denomination: null,
      naf: null,
    });
    await recordBenchmarkCandidateOutcome(connection!, cohortVersion, 'unreachable.example', {
      resolvedHost: null,
      status: 'fetch-failed',
      reasons: [],
      fetchFailureReason: 'homepage-unreachable',
      siren: null,
      denomination: null,
      naf: null,
    });

    const summary = await getBenchmarkQualificationSummary(connection!, cohortVersion);
    expect(summary.total).toBe(4);
    expect(summary.byStatus.qualified).toBe(1);
    expect(summary.byStatus.disqualified).toBe(1);
    expect(summary.byStatus['fetch-failed']).toBe(2);
    expect(summary.byStatus.pending).toBe(0);
    expect(summary.byReason['no-siren-extracted']).toBe(1);
    expect(summary.byReason['domain-suppressed']).toBe(1);
    expect(summary.byFetchFailureReason['robots-disallowed']).toBe(1);
    expect(summary.byFetchFailureReason['homepage-unreachable']).toBe(1);
  });

  it('treats a pre-existing document with no fetchFailureReason field as having none, not "undefined"', async () => {
    const cohortVersion = `test-legacy-doc-${Date.now()}`;
    // Simulates a document written before this field existed: inserted
    // directly, bypassing recordBenchmarkCandidateOutcome so the field is
    // genuinely absent rather than set to null.
    const BenchmarkCandidateModel = createBenchmarkCandidateModel(connection!);
    await BenchmarkCandidateModel.collection.insertOne({
      cohortVersion,
      rank: 1,
      domain: 'legacy.example',
      resolvedHost: null,
      status: 'fetch-failed',
      reasons: [],
      siren: null,
      denomination: null,
      naf: null,
      evaluatedAt: null,
      createdAt: new Date(),
    });

    const summary = await getBenchmarkQualificationSummary(connection!, cohortVersion);
    expect(summary.byStatus['fetch-failed']).toBe(1);
    expect(summary.byFetchFailureReason).toEqual({});
    expect(Object.keys(summary.byFetchFailureReason)).not.toContain('undefined');
  });
});
