import { describe, expect, it } from 'vitest';
import type { CoverageLedger, ReviewIssue, Sha256Digest } from '@odysseus/core';
import {
  assertCoverageAndPlan,
  assertNoBlockingReviewIssues,
  assertReauditComparabilityLanguage,
  assertSeniorReportPlan,
  deterministicProseViolations,
} from './plan-guards.js';
import { reportQualityDigest } from './digest.js';
import {
  buildFinding,
  buildPayload,
  buildPlan,
  buildProject,
  ledgerSnapshotOf,
} from './test-fixtures.js';

const payload = buildPayload([
  buildFinding({ findingId: 'f-contrast', category: 'accessibility', severity: 'serious' }),
  buildFinding({ findingId: 'f-lcp', category: 'performance', severity: 'moderate' }),
  buildFinding({ findingId: 'f-meta', category: 'seo', severity: 'minor' }),
]);
const eligible = ['f-contrast', 'f-lcp'];

function completePlan() {
  return buildPlan(
    [buildProject({ projectKey: 'fix-contrast', findingIds: eligible })],
    ['fix-contrast'],
  );
}

function reconciledLedger(): CoverageLedger {
  const reconciled = structuredClone(ledgerSnapshotOf(payload));
  reconciled.entries = reconciled.entries.map((entry) =>
    entry.eligible ? { ...entry, disposition: 'project', projectKey: 'fix-contrast' } : entry,
  );
  return reconciled;
}

describe('assertSeniorReportPlan', () => {
  it('accepts a plan that assigns every eligible finding exactly once with valid priorities', () => {
    expect(() => assertSeniorReportPlan(completePlan(), payload)).not.toThrow();
  });

  it('rejects duplicate finding membership across projects', () => {
    const plan = buildPlan(
      [
        buildProject({ projectKey: 'fix-contrast', findingIds: ['f-contrast'] }),
        buildProject({ projectKey: 'fix-lcp', findingIds: ['f-contrast', 'f-lcp'] }),
      ],
      ['fix-contrast'],
    );
    expect(() => assertSeniorReportPlan(plan, payload)).toThrow(
      'Finding f-contrast is assigned to multiple remediation projects (fix-contrast, fix-lcp)',
    );
  });

  it('allows a finding to be shared only through an explicit shared dependency, without owning it twice', () => {
    const plan = buildPlan(
      [
        buildProject({ projectKey: 'fix-contrast', findingIds: ['f-contrast'] }),
        buildProject({
          projectKey: 'fix-lcp',
          findingIds: ['f-lcp'],
          sharedDependencies: ['f-contrast'],
        }),
      ],
      ['fix-contrast', 'fix-lcp'],
    );
    expect(() => assertSeniorReportPlan(plan, payload)).not.toThrow();
  });

  it('rejects a project that references an unknown finding id', () => {
    const plan = buildPlan(
      [buildProject({ projectKey: 'fix-contrast', findingIds: ['f-contrast', 'f-ghost'] })],
      ['fix-contrast'],
    );
    expect(() => assertSeniorReportPlan(plan, payload)).toThrow(
      'Remediation project references unknown finding(s): f-ghost',
    );
  });

  it('rejects duplicate project keys and empty projects', () => {
    const duplicated = buildPlan(
      [
        buildProject({ projectKey: 'fix-contrast', findingIds: ['f-contrast'] }),
        buildProject({ projectKey: 'fix-contrast', findingIds: ['f-lcp'] }),
      ],
      ['fix-contrast'],
    );
    expect(() => assertSeniorReportPlan(duplicated, payload)).toThrow(
      'Duplicate remediation project key: fix-contrast',
    );
    const empty = buildPlan([buildProject({ projectKey: 'fix-empty', findingIds: [] })], []);
    expect(() => assertSeniorReportPlan(empty, payload)).toThrow(
      'Empty remediation project: fix-empty',
    );
  });

  it('rejects executive priority keys that name no project', () => {
    const plan = buildPlan(
      [buildProject({ projectKey: 'fix-contrast', findingIds: eligible })],
      ['fix-contrast', 'fix-ghost'],
    );
    expect(() => assertSeniorReportPlan(plan, payload)).toThrow(
      'Executive priority references unknown project(s): fix-ghost',
    );
  });
});

describe('assertCoverageAndPlan chains plan and coverage guards', () => {
  it('accepts a reconciled ledger whose eligible findings are all project-owned', () => {
    expect(() => assertCoverageAndPlan(reconciledLedger(), completePlan(), payload)).not.toThrow();
  });

  it('rejects unassigned eligible findings even when the plan itself is well-formed', () => {
    expect(() => assertCoverageAndPlan(ledgerSnapshotOf(payload), completePlan(), payload)).toThrow(
      'Senior report plan omitted eligible finding(s): f-contrast, f-lcp',
    );
  });

  it('rejects a ledger missing a finding, and a ledger bound to a different snapshot digest', () => {
    const missingEntry = ledgerSnapshotOf(payload);
    missingEntry.entries = missingEntry.entries.filter((entry) => entry.findingId !== 'f-contrast');
    expect(() => assertCoverageAndPlan(missingEntry, completePlan(), payload)).toThrow(
      /missing: f-contrast/,
    );

    const wrongDigest = reconciledLedger();
    wrongDigest.inputSnapshotDigest = `sha256:${'9'.repeat(64)}` as Sha256Digest;
    expect(() => assertCoverageAndPlan(wrongDigest, completePlan(), payload)).toThrow(
      'Coverage ledger input snapshot digest does not match the approved evidence payload',
    );
  });
});

describe('assertNoBlockingReviewIssues', () => {
  const base: ReviewIssue = {
    issueId: 'issue-1',
    kind: 'objective-defect',
    severity: 'blocking',
    target: 'executiveSummary',
    domain: 'evidence',
    supportingRefs: [],
    reason: 'Contradicts the ledger',
    repairRoute: 'patch-prose',
    status: 'proposed',
    sourceRole: 'content-critic-evidence',
    artifactDigest: reportQualityDigest({ issue: 1 }),
  };
  it('blocks accepted or unsure objective defects only', () => {
    expect(() =>
      assertNoBlockingReviewIssues([
        { ...base, status: 'rejected' },
        { ...base, issueId: 'issue-2', kind: 'preference', status: 'accepted' },
      ]),
    ).not.toThrow();
    expect(() => assertNoBlockingReviewIssues([{ ...base, status: 'accepted' }])).toThrow(
      'Known objective report defect(s) remain: issue-1',
    );
    expect(() => assertNoBlockingReviewIssues([{ ...base, status: 'unsure' }])).toThrow('issue-1');
  });
});

describe('deterministicProseViolations flags the Plan 058 content faults', () => {
  it('flags a Lighthouse lab metric labeled as a Core Web Vital', () => {
    expect(
      deterministicProseViolations('Le TBT est l’un des Core Web Vitals à surveiller.'),
    ).toEqual(['performance-taxonomy']);
    expect(
      deterministicProseViolations(
        'Speed Index is one of the Core Web Vitals measured by Lighthouse.',
      ),
    ).toContain('performance-taxonomy');
  });

  it('flags a lab metric labeled as field data', () => {
    expect(
      deterministicProseViolations('Total Blocking Time comes from the field data of real users.'),
    ).toEqual(['performance-taxonomy']);
    expect(
      deterministicProseViolations('Le Speed Index provient des données de terrain Chrome UX.'),
    ).toEqual(['performance-taxonomy']);
  });

  it('flags unsupported lost-booking, revenue and conversion causality in both languages', () => {
    expect(
      deterministicProseViolations('These contrast failures are costing you bookings every week.'),
    ).toEqual(['unsupported-business-causality']);
    expect(
      deterministicProseViolations('Without a fix, the site is losing revenue to competitors.'),
    ).toEqual(['unsupported-business-causality']);
    expect(
      deterministicProseViolations(
        'Chaque mois sans correction vous fait perdre des réservations.',
      ),
    ).toEqual(['unsupported-business-causality']);
    expect(
      deterministicProseViolations('Ces blocages se traduisent par des conversions manquées.'),
    ).toEqual(['unsupported-business-causality']);
  });

  it('flags a newly-observable finding described as newly introduced or as a regression', () => {
    expect(
      deterministicProseViolations(
        'This check is newly observable, so the defect is a regression introduced last quarter.',
      ),
    ).toEqual(['newly-observable-as-new-or-regression']);
    expect(
      deterministicProseViolations(
        'Critère nouvellement mesurable : un nouveau problème est apparu sur le site.',
      ),
    ).toEqual(['newly-observable-as-new-or-regression']);
  });

  it('flags a not-comparable finding described as resolved', () => {
    expect(
      deterministicProseViolations(
        'Coverage for this check is not comparable, so the issue can be considered resolved.',
      ),
    ).toEqual(['not-comparable-as-resolved']);
    expect(
      deterministicProseViolations(
        'Données non comparables : le défaut a été corrigé depuis le dernier audit.',
      ),
    ).toEqual(['not-comparable-as-resolved']);
  });

  it('still flags unsupported certainty, and leaves disciplined consulting prose untouched', () => {
    expect(deterministicProseViolations('Votre site est garanti conforme.')).toContain(
      'unsupported-certainty',
    );
    expect(
      deterministicProseViolations(
        'Le contraste insuffisant complique la lecture des prix. Nous recommandons d’assombrir le texte, puis de vérifier le critère 1.4.3 avec l’outil de contraste intégré.',
      ),
    ).toEqual([]);
    expect(
      deterministicProseViolations(
        'This check is newly observable: Odysseus now tests this criterion, which the baseline could not measure.',
      ),
    ).toEqual([]);
    expect(
      deterministicProseViolations(
        'Coverage for this check is not comparable between the two runs, so no direction of change is claimed.',
      ),
    ).toEqual([]);
  });
});

describe('assertReauditComparabilityLanguage', () => {
  it('accepts any directional wording when the evidence coverage is comparable', () => {
    expect(() =>
      assertReauditComparabilityLanguage('Le délai de chargement a été amélioré.', true),
    ).not.toThrow();
    expect(() =>
      assertReauditComparabilityLanguage('Performance regressed on mobile.', true),
    ).not.toThrow();
  });

  it('rejects flattening an incomparable re-audit into improvement or regression claims', () => {
    expect(() =>
      assertReauditComparabilityLanguage(
        'Le contraste a été amélioré depuis le dernier audit.',
        false,
      ),
    ).toThrow('Re-audit comparison language is not allowed without comparable evidence coverage');
    expect(() =>
      assertReauditComparabilityLanguage('Conversion tracking improved.', false),
    ).toThrow(/comparison language/);
    expect(() =>
      assertReauditComparabilityLanguage('Mobile rendering regressed. Dégradation visible.', false),
    ).toThrow(/comparison language/);
  });

  it('accepts neutral incomparability wording when nothing is comparable', () => {
    expect(() =>
      assertReauditComparabilityLanguage(
        'Cette exécution ne peut pas être comparée à la précédente ; aucun sens de variation n’est affirmé.',
        false,
      ),
    ).not.toThrow();
  });
});
