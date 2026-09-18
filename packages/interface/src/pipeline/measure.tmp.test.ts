// Scratch payload-size probe over a local pilot audit; never run in CI.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from 'vitest';
import { loadAuditEvidencePayload } from './report-quality-evidence.js';

function compact(evidence: unknown) {
  // Mirrors report-quality-pipeline compactEvidence field selection
  const e = evidence as {
    approval: unknown;
    findings: any[];
    patternEvidence?: unknown;
    mandatoryDisclosures?: unknown;
  };
  return {
    approval: e.approval,
    findings: e.findings.map((f) => ({
      findingId: f.findingId,
      ruleId: f.ruleId,
      category: f.category,
      severity: f.severity,
      wcagCriteria: f.wcagCriteria,
      title: f.title,
      description: f.description,
      pageUrls: f.pageUrls,
      occurrences: f.occurrences,
    })),
    patternEvidence: e.patternEvidence ?? [],
    mandatoryDisclosures: e.mandatoryDisclosures,
  };
}

describe('measure', () => {
  it('prints payload sizes for the pilot audit', async () => {
    const auditDir = 'artifacts/grandhotelchicago.paris/2026-09-17T14-28-58Z';
    const manifest = JSON.parse(
      (await import('node:fs')).readFileSync(auditDir + '/manifest.json', 'utf8'),
    );
    const findings = JSON.parse(
      (await import('node:fs')).readFileSync(auditDir + '/findings.json', 'utf8'),
    );
    const evidence = loadAuditEvidencePayload({ auditDir, manifest, findings });
    const ce = compact(evidence);
    const snapshot = {
      snapshotVersion: '058-v1',
      auditId: 'x',
      approvedEvidenceDigest: `sha256:${'0'.repeat(64)}`,
      evidenceQualityAssessmentDigest: `sha256:${'0'.repeat(64)}`,
      auditIdentityDigest: `sha256:${'0'.repeat(64)}`,
      reportOnlyInputsDigest: `sha256:${'0'.repeat(64)}`,
      referenceRegistryDigest: `sha256:${'0'.repeat(64)}`,
      reportTemplateVersion: 1,
      rendererBuild: 'x',
      rendererFingerprint: `sha256:${'0'.repeat(64)}`,
      fontFingerprint: `sha256:${'0'.repeat(64)}`,
      modelProfileDigest: `sha256:${'0'.repeat(64)}`,
      qualityToolFingerprint: `sha256:${'0'.repeat(64)}`,
      requestedLanguages: ['fr', 'en'],
      createdAt: new Date().toISOString(),
    } as any;
    const { buildReportFactRegistry, buildReportEvidenceDossier } =
      await import('@odysseus/report');
    const registry = buildReportFactRegistry(evidence, snapshot, { preparation: {} as any });
    const dossier = buildReportEvidenceDossier(evidence, snapshot);
    const kb = (s: string) => (s.length / 1024).toFixed(0);
    const senior = JSON.stringify({
      inputSnapshotDigest: snapshot.approvedEvidenceDigest,
      evidence: ce,
      dossier,
      factRegistry: registry,
    });
    const writer = JSON.stringify({
      seniorPlan: { remediationProjects: seniorPlanFrom(dossier) },
      evidenceDossier: dossier,
      factRegistry: registry,
      mandatoryDisclosures: evidence.mandatoryDisclosures,
    });
    console.log('MEASURE compactEvidence chars:', ce && JSON.stringify(ce).length);
    console.log('MEASURE senior payload chars:', senior.length, '=', kb(senior), 'KiB');
    console.log('MEASURE writer payload chars:', writer.length, '=', kb(writer), 'KiB');
    console.log(
      'MEASURE registry facts:',
      registry.facts.length,
      'dossier packets:',
      dossier.packets.length,
      'patterns:',
      dossier.patterns.length,
    );
    console.log(
      'MEASURE findings:',
      evidence.findings.length,
      'disclosures:',
      evidence.mandatoryDisclosures.length,
    );
  });
});

function seniorPlanFrom(dossier: any) {
  return dossier.packets.map((p: any, i: number) => ({
    projectKey: 'k' + i,
    category: p.category,
    findingIds: p.findingIds,
    evidenceRefs: p.representativeEvidenceRefs,
    factRefs: [],
    impact: 'high',
    effort: 'medium',
    rationale: 'x',
    dependencies: [],
    sharedDependencies: [],
  }));
}
