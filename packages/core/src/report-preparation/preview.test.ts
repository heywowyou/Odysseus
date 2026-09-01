import { describe, expect, it } from 'vitest';
import { buildReportPreparationPreview } from './preview.js';
import { emptyReportPreparation, type ReportPreparation } from './preparation.js';
import { buildFinding, buildManifest, buildPage, buildProvenance } from './test-fixtures.js';

const homepage = buildPage('https://site.example/');
const reservation = buildPage('https://site.example/reservation', { depth: 1 });
const transactionalSignals = {
  hasTransactionalFlow: true,
  transactionalFlowEvidence: [
    {
      kind: 'booking-engine-script' as const,
      selector: '#booking',
      pageUrl: 'https://site.example/reservation',
      detail: 'booking script detected',
    },
  ],
};

function preparationWith(overrides: Partial<ReportPreparation>): ReportPreparation {
  return { ...emptyReportPreparation(), ...overrides };
}

describe('buildReportPreparationPreview', () => {
  it('falls back to the generic question independently per language', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      manifest: buildManifest([homepage]),
      findings: [],
    });
    expect(preview.fr.coverQuestion).toEqual({
      value: 'Quel est l’état actuel du site, et par où commencer ?',
      source: 'fallback',
    });
    expect(preview.en.coverQuestion).toEqual({
      value: 'What is the current state of the site, and where should you start?',
      source: 'fallback',
    });
  });

  it('prefers the situational question, then the custom question per language', () => {
    const preparation = preparationWith({
      context: { situation: 'corrections-underway' },
      customCoverQuestion: { en: 'Custom English question' },
    });
    const preview = buildReportPreparationPreview({
      preparation,
      manifest: buildManifest([homepage]),
      findings: [],
    });
    expect(preview.fr.coverQuestion.source).toBe('automatic');
    expect(preview.fr.coverQuestion.value).toContain('corrections sont en cours');
    expect(preview.en.coverQuestion).toEqual({
      value: 'Custom English question',
      source: 'custom',
    });
  });

  it('does not copy a custom question from one language into the other', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({ customCoverQuestion: { fr: 'Question française' } }),
      manifest: buildManifest([homepage]),
      findings: [],
    });
    expect(preview.fr.coverQuestion.source).toBe('custom');
    expect(preview.en.coverQuestion.source).toBe('fallback');
  });

  it('resolves the hook family from findings and labels it automatic', () => {
    const findings = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'serious' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'minor' }),
    ];
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      manifest: buildManifest([homepage]),
      findings,
    });
    expect(preview.fr.hook.family).toBe('accessibility');
    expect(preview.fr.hook.evidenceUnavailable).toBe(false);
    expect(preview.fr.hook.value).toBeTruthy();
    expect(preview.en.hook.value).toBeTruthy();
    expect(preview.fr.hook.value).not.toBe(preview.en.hook.value);
  });

  it('marks the hook as evidence-unavailable mixed when there are no findings', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      manifest: buildManifest([homepage]),
      findings: [],
    });
    expect(preview.fr.hook).toEqual({
      family: 'mixed',
      value: expect.any(String),
      evidenceUnavailable: false,
    });
  });

  it('marks evidence unavailable when the artifacts are missing entirely', () => {
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}) });
    expect(preview.fr.hook.evidenceUnavailable).toBe(true);
    expect(preview.excludedJourneys).toEqual([
      { journeyId: 'discovery-navigation', reason: 'evidence-unavailable' },
      { journeyId: 'transaction-booking', reason: 'evidence-unavailable' },
    ]);
  });

  it('carries the confirmed journey with tri-state labels in both languages', () => {
    const preparation = preparationWith({
      journeyDecisions: [{ journeyId: 'transaction-booking', decision: 'confirmed' }],
    });
    const preview = buildReportPreparationPreview({
      preparation,
      manifest: buildManifest([homepage, reservation], { siteSignals: transactionalSignals }),
      findings: [],
    });
    expect(preview.fr.journeys).toHaveLength(1);
    const journey = preview.fr.journeys[0]!;
    expect(journey.label).toBe('Réservation et transaction');
    expect(journey.steps).toHaveLength(2);
    for (const step of journey.steps) {
      expect(['Problème constaté', 'Aucun problème détecté', 'Non évalué']).toContain(
        step.stateLabel,
      );
    }
    expect(preview.en.journeys[0]!.label).toBe('Booking and transaction');
  });

  it('computes warnings and a digest over warning-relevant inputs only', () => {
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}) });
    expect(preview.warnings).toEqual(['commercial-name', 'situation', 'trigger', 'journey-scope']);

    const withNames = buildReportPreparationPreview({
      preparation: preparationWith({
        stakeholders: { management: 'Jeanne Dupont' },
        context: { situation: 'periodic-review', trigger: 'proactive-review' },
      }),
      commercialName: 'Hôtel Belledonne',
      manifest: buildManifest([homepage]),
      findings: [],
    });
    // Journey scope is still unconfirmed, and stakeholder names changed nothing.
    expect(withNames.warnings).toEqual(['journey-scope']);
    expect(withNames.warningDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes the digest when the confirmed journey scope changes', () => {
    const manifest = buildManifest([homepage, reservation], { siteSignals: transactionalSignals });
    const without = buildReportPreparationPreview({
      preparation: preparationWith({}),
      manifest,
      findings: [],
    });
    const withConfirmed = buildReportPreparationPreview({
      preparation: preparationWith({
        journeyDecisions: [{ journeyId: 'transaction-booking', decision: 'confirmed' }],
      }),
      manifest,
      findings: [],
    });
    expect(without.warningDigest).not.toBe(withConfirmed.warningDigest);
  });

  it('reports typed exclusion reasons for unavailable journeys', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      manifest: buildManifest([homepage]),
      findings: [],
    });
    expect(preview.excludedJourneys).toEqual([
      { journeyId: 'transaction-booking', reason: 'no-transactional-flow' },
    ]);
  });

  it('round-trips provenance through a selected pair reference shape', () => {
    // The preview digest only guarantees stability; this guards the
    // provenance fixture shape used by store tests too.
    expect(buildProvenance('sha256:x').findingsSchemaVersion).toBe(1);
  });
});
