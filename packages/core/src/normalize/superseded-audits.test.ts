/**
 * D13 (2026-08-25, Lagnonu review). Lighthouse ships its newer "insight"
 * audits alongside the legacy audits they supersede, naming them in
 * `replacesAudits`, and we emitted findings from both sides. A real report
 * put the same image problem in front of the client four times, as
 * image-delivery-insight, modern-image-formats, uses-optimized-images and
 * uses-responsive-images.
 *
 * The rule has to hold three things at once, and each is a separate test
 * below because each was a wrong answer tried first:
 *   - never lose a finding: the two sides genuinely disagree, so a successor
 *     that is not itself reporting must suppress nothing;
 *   - never lose evidence: a successor whose file set is not a superset of
 *     what it replaces must absorb those files, not drop them;
 *   - never half-collapse: supersession is decided across the audit, not per
 *     page, or a successor that skips one page leaves the legacy standing.
 */
import { describe, expect, it } from 'vitest';
import { normalizeAudit } from './normalize.js';
import type { NormalizePageInput } from './normalize.js';

interface AuditSpec {
  score: number | null;
  items?: unknown;
  replacesAudits?: string[];
  scoreDisplayMode?: string;
}

function report(audits: Record<string, AuditSpec>): unknown {
  return {
    categories: {
      performance: {
        auditRefs: Object.keys(audits).map((id) => ({ id, weight: 3, group: 'diagnostics' })),
      },
    },
    audits: Object.fromEntries(
      Object.entries(audits).map(([id, spec]) => [
        id,
        {
          id,
          title: `title for ${id}`,
          description: `description for ${id}`,
          score: spec.score,
          scoreDisplayMode: spec.scoreDisplayMode ?? 'metricSavings',
          details: { items: spec.items ?? [] },
          ...(spec.replacesAudits ? { replacesAudits: spec.replacesAudits } : {}),
        },
      ]),
    ),
  };
}

function urlItems(...urls: string[]): unknown {
  return urls.map((url) => ({ url, totalBytes: 1000, wastedBytes: 500 }));
}

function page(url: string, lighthouse: unknown): NormalizePageInput {
  return { url, lighthouse } as unknown as NormalizePageInput;
}

function normalize(pages: NormalizePageInput[]) {
  return normalizeAudit({
    auditId: 'audit-1',
    startedAt: new Date('2026-08-25T00:00:00Z'),
    pages,
  } as unknown as Parameters<typeof normalizeAudit>[0]);
}

const SUCCESSOR = 'image-delivery-insight';
const LEGACY = 'modern-image-formats';

describe('D13: a Lighthouse insight suppresses the audits it replaces', () => {
  it('reports one finding, not two, when both sides fire', () => {
    const findings = normalize([
      page(
        'https://example.com/',
        report({
          [SUCCESSOR]: {
            score: 0.5,
            items: urlItems('https://example.com/a.jpg'),
            replacesAudits: [LEGACY],
          },
          [LEGACY]: { score: 0.5, items: urlItems('https://example.com/a.jpg') },
        }),
      ),
    ]);

    expect(findings.map((f) => f.ruleId)).toContain(SUCCESSOR);
    expect(findings.map((f) => f.ruleId)).not.toContain(LEGACY);
  });

  it('absorbs the replaced audit files the successor does not name itself', () => {
    // The real reason this cannot be a plain drop: measured on the reference
    // audits, the successor's file set is not a superset. Suppressing
    // outright lost 14 image URLs on sas-fernande.fr and 6 on lagnonu.fr.
    const findings = normalize([
      page(
        'https://example.com/',
        report({
          [SUCCESSOR]: {
            score: 0.5,
            items: urlItems('https://example.com/shared.jpg'),
            replacesAudits: [LEGACY],
          },
          [LEGACY]: {
            score: 0.5,
            items: urlItems(
              'https://example.com/shared.jpg',
              'https://example.com/only-legacy.jpg',
            ),
          },
        }),
      ),
    ]);

    const finding = findings.find((f) => f.ruleId === SUCCESSOR);
    expect(finding?.occurrences).toBe(1);
    expect(finding?.rawEvidence).toMatchObject({
      resourceUrls: ['https://example.com/only-legacy.jpg', 'https://example.com/shared.jpg'],
    });
  });

  it('suppresses nothing when the successor is not itself reporting', () => {
    // font-display-insight scored 0 while font-display passed, and
    // document-latency-insight scored 1 while the uses-text-compression it
    // replaces scored 0.5 with eight real files. Both directions are real.
    const findings = normalize([
      page(
        'https://example.com/',
        report({
          [SUCCESSOR]: {
            score: 1,
            items: urlItems('https://example.com/a.jpg'),
            replacesAudits: [LEGACY],
          },
          [LEGACY]: { score: 0.5, items: urlItems('https://example.com/a.jpg') },
        }),
      ),
    ]);

    expect(findings.map((f) => f.ruleId)).toContain(LEGACY);
  });

  it('suppresses nothing when the successor carries no actionable detail', () => {
    // cls-culprits-insight reports through a nested table and
    // lcp-discovery-insight through a checklist: neither names a file or a
    // node at item level, so both render as a blank row. Letting those
    // suppress layout-shifts (15 items) would trade evidence for silence.
    const findings = normalize([
      page(
        'https://example.com/',
        report({
          'cls-culprits-insight': {
            score: 0.5,
            items: [{ type: 'table', headings: [], items: [] }],
            replacesAudits: ['layout-shifts'],
          },
          'layout-shifts': { score: 0.5, items: urlItems('https://example.com/a.jpg') },
        }),
      ),
    ]);

    expect(findings.map((f) => f.ruleId)).toContain('layout-shifts');
  });

  it('decides across the whole audit, not page by page', () => {
    // haaitza.com: image-delivery-insight does not emit on every page. Per
    // page, the legacy audits survived on the pages it skipped and the
    // client still read four image findings.
    const findings = normalize([
      page(
        'https://example.com/',
        report({
          [SUCCESSOR]: {
            score: 0.5,
            items: urlItems('https://example.com/a.jpg'),
            replacesAudits: [LEGACY],
          },
          [LEGACY]: { score: 0.5, items: urlItems('https://example.com/a.jpg') },
        }),
      ),
      page(
        'https://example.com/second',
        report({
          // Successor passes here, legacy still fails. Without an
          // audit-wide decision this page alone re-creates the duplicate.
          [SUCCESSOR]: {
            score: 1,
            items: urlItems('https://example.com/a.jpg'),
            replacesAudits: [LEGACY],
          },
          [LEGACY]: { score: 0.5, items: urlItems('https://example.com/second-only.jpg') },
        }),
      ),
    ]);

    expect(findings.map((f) => f.ruleId)).not.toContain(LEGACY);
    const finding = findings.find((f) => f.ruleId === SUCCESSOR);
    expect(finding?.rawEvidence).toMatchObject({
      resourceUrls: ['https://example.com/a.jpg', 'https://example.com/second-only.jpg'],
    });
  });
});
