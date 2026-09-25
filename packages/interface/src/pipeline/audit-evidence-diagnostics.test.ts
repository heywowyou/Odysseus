import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalDigest } from '@odysseus/core';
import { AUDIT_EVIDENCE_SNAPSHOT_PATH, EVIDENCE_QUALITY_ASSESSMENT_PATH } from '@odysseus/scanner';
import {
  EVIDENCE_REASON_CLASSIFICATION,
  readAuditEvidenceDiagnostics,
  summarizeAuditEvidenceDiagnostics,
  type BlockedPagesAcknowledgmentInput,
} from './audit-evidence-diagnostics.js';

const ROOT_BODY = {
  auditId: 'foch',
  evidenceEpoch: 1,
  confirmedFindingsDigest: 'sha256:findings',
};
const ROOT = { ...ROOT_BODY, digest: canonicalDigest(ROOT_BODY) };

function quality(issues: unknown[]) {
  const body = {
    auditId: 'foch',
    evidenceEpoch: 1,
    auditEvidenceSnapshotDigest: ROOT.digest,
    issues,
  };
  return { ...body, digest: canonicalDigest(body) };
}

function issue(code: string, refs: string[] = ['ref-1'], disclosure?: unknown) {
  return { code, evidenceRefs: refs, ...(disclosure === undefined ? {} : { disclosure }) };
}

describe('Plan 068 evidence diagnostics', () => {
  it('classifies every emitted reason code exactly once', () => {
    expect(Object.keys(EVIDENCE_REASON_CLASSIFICATION).sort()).toEqual([
      'capability-gap-undisclosed',
      'consistency-gate-failed',
      'disclosed-scope-limitation',
      'environment-unapproved',
      'inventory-unreconciled',
      'legacy-evidence-insufficient',
      'network-safety-preflight-failed',
      'operator-resolution-required',
      'performance-confidence-insufficient',
      'raw-evidence-invalid',
      'robots-policy-unresolved',
      'site-level-unknown',
      'temporal-coherence-unverified',
      'temporal-drift',
      'unresolved-material-gap',
      'unstable-material-result',
    ]);
  });

  it('projects the Foch-shaped assessment as limited while separating environment diagnostics', () => {
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([
        issue('environment-unapproved'),
        issue('site-level-unknown', ['site:security-headers']),
        issue('unresolved-material-gap', ['page:booking']),
        issue('temporal-drift', ['temporal:home']),
      ]),
    });
    expect(result.status).toBe('limited');
    expect(result.operationalWarnings).toEqual([
      { code: 'environment-unapproved', referenceCount: 1 },
    ]);
    expect(result.clientLimitations.map((entry) => entry.code).sort()).toEqual([
      'site-level-unknown',
      'temporal-drift',
      'unresolved-material-gap',
    ]);
  });

  it('keeps an environment warning operational-only and complete for report claims', () => {
    expect(
      summarizeAuditEvidenceDiagnostics({
        auditRoot: ROOT,
        quality: quality([issue('environment-unapproved')]),
      }),
    ).toEqual({
      status: 'complete',
      clientLimitations: [],
      operationalWarnings: [{ code: 'environment-unapproved', referenceCount: 1 }],
    });
  });

  it.each(['site-level-unknown', 'unresolved-material-gap', 'temporal-drift'] as const)(
    '%s narrows the report instead of invalidating it',
    (code) => {
      const result = summarizeAuditEvidenceDiagnostics({
        auditRoot: ROOT,
        quality: quality([issue(code)]),
      });
      expect(result.status).toBe('limited');
      expect(result.clientLimitations).toHaveLength(1);
    },
  );

  it('reuses an existing disclosure verbatim when one is present', () => {
    const disclosure = {
      limitationId: 'limitation:stored',
      code: 'stored-copy',
      summary: { fr: 'Copie historique.', en: 'Historical copy.' },
      reportDestination: 'section-11',
      evidenceRefs: ['stored-ref'],
    };
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([issue('unresolved-material-gap', ['new-ref'], disclosure)]),
    });
    expect(result.clientLimitations).toEqual([disclosure]);
  });

  it('maps an old blocking issue with no disclosure without rewriting its artifact', () => {
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([issue('site-level-unknown', ['legacy-ref'])]),
    });
    expect(result.clientLimitations[0]).toMatchObject({
      code: 'site-level-unknown',
      evidenceRefs: ['legacy-ref'],
    });
    expect(result.clientLimitations[0]?.summary.fr.length).toBeGreaterThan(20);
    expect(result.clientLimitations[0]?.summary.en.length).toBeGreaterThan(20);
  });

  it('treats missing or inconsistent diagnostics as unavailable, never as audit invalid', () => {
    expect(
      summarizeAuditEvidenceDiagnostics({ quality: undefined, auditRoot: undefined }).status,
    ).toBe('unavailable');
    expect(
      summarizeAuditEvidenceDiagnostics({
        quality: quality([]),
        auditRoot: { ...ROOT, digest: 'sha256:other-root' },
      }).status,
    ).toBe('unavailable');
    const tampered = quality([issue('site-level-unknown')]);
    expect(
      summarizeAuditEvidenceDiagnostics({
        quality: { ...tampered, issues: [issue('temporal-drift')] },
        auditRoot: ROOT,
      }).status,
    ).toBe('unavailable');
    expect(
      summarizeAuditEvidenceDiagnostics({
        quality: quality([issue('consistency-gate-failed')]),
        auditRoot: ROOT,
      }).status,
    ).toBe('unavailable');
  });
});

describe('blocked content pages and the operator acknowledgment', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'odysseus-blocked-pages-'));
  afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

  const HOME = 'https://hotel.example/';
  const BOOKING_FR = 'https://hotel.example/fr/reservation.html';
  const BOOKING_EN = 'https://hotel.example/en/booking.html';
  const completedPasses = {
    passes: {
      rendered: { outcome: 'completed' },
      axe: { outcome: 'completed' },
      extended: { outcome: 'completed' },
    },
  };
  let auditCounter = 0;

  function writeAudit(pages: unknown[]): { auditDir: string; startedAt: Date } {
    auditCounter += 1;
    const auditDir = path.join(tempRoot, `audit-${auditCounter}`);
    const write = (relativePath: string, body: unknown): void => {
      mkdirSync(path.dirname(path.join(auditDir, relativePath)), { recursive: true });
      writeFileSync(path.join(auditDir, relativePath), JSON.stringify(body));
    };
    write(EVIDENCE_QUALITY_ASSESSMENT_PATH, quality([]));
    write(AUDIT_EVIDENCE_SNAPSHOT_PATH, ROOT);
    write('manifest.json', { crawl: { startUrl: HOME }, pages });
    // A distinct start time per audit keeps the diagnostics cache apart.
    return { auditDir, startedAt: new Date(Date.UTC(2026, 8, 25, 0, 0, auditCounter)) };
  }

  function read(
    audit: { auditDir: string; startedAt: Date },
    blockedPagesAcknowledgment?: BlockedPagesAcknowledgmentInput,
  ) {
    return readAuditEvidenceDiagnostics({
      ...audit,
      hostname: 'hotel.example',
      store: undefined,
      blockedPagesAcknowledgment,
    });
  }

  const acceptedAt = new Date('2026-09-25T15:00:00.000Z');
  const bookingPages = [
    { url: HOME, status: 'visited', analysisCoverage: completedPasses },
    { url: BOOKING_FR, status: 'blocked' },
    { url: BOOKING_EN, status: 'blocked' },
  ];

  it('blocks the report and names the blocked pages as acceptable when the homepage was analysed', async () => {
    const diagnostics = await read(writeAudit(bookingPages));
    expect(diagnostics.reportBlocked).toBe(true);
    expect(diagnostics.blockedPageUrls).toEqual([BOOKING_EN, BOOKING_FR]);
    expect(diagnostics.blockedPagesAcknowledgeable).toBe(true);
    expect(diagnostics.blockedPagesAcknowledgedAt).toBeUndefined();
  });

  it('lifts the block and discloses the uncovered pages when exactly those pages were accepted', async () => {
    const diagnostics = await read(writeAudit(bookingPages), {
      blockedPageUrls: [BOOKING_FR, BOOKING_EN],
      acknowledgedAt: acceptedAt,
    });
    expect(diagnostics.reportBlocked).toBe(false);
    expect(diagnostics.blockingReasons).toEqual([]);
    expect(diagnostics.blockedPagesAcknowledgedAt).toBe(acceptedAt.toISOString());
    const limitation = diagnostics.clientLimitations.find(
      (item) => item.limitationId === 'limitation:operator-resolution-required',
    );
    expect(limitation?.evidenceRefs).toEqual([BOOKING_EN, BOOKING_FR]);
    expect(limitation?.summary.fr).toBe(
      'Le site a présenté une vérification anti-robot à chaque tentative sur 2 pages, qui n’ont pas pu être analysées. Le rapport ne contient aucun constat sur ces pages.',
    );
    expect(limitation?.summary.fr).not.toMatch(/bloqué/u);
  });

  it('keeps the block when the accepted set differs from the pages blocked now', async () => {
    const diagnostics = await read(writeAudit(bookingPages), {
      blockedPageUrls: [BOOKING_FR],
      acknowledgedAt: acceptedAt,
    });
    expect(diagnostics.reportBlocked).toBe(true);
    expect(diagnostics.blockedPagesAcknowledgedAt).toBeUndefined();
  });

  it('never lifts the block when the homepage has no usable evidence', async () => {
    const diagnostics = await read(
      writeAudit([
        { url: HOME, status: 'blocked' },
        { url: BOOKING_FR, status: 'blocked' },
      ]),
      { blockedPageUrls: [BOOKING_FR, HOME], acknowledgedAt: acceptedAt },
    );
    expect(diagnostics.reportBlocked).toBe(true);
    expect(diagnostics.blockedPagesAcknowledgeable).toBe(false);
  });
});
