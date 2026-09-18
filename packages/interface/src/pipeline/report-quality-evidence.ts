import {
  assertFindingsProvenance,
  assertSufficientCrawlCoverage,
  buildFindingsProvenance,
  type ApprovedAuditEvidencePayload,
  type AuditManifest,
  type EvidenceLimitation,
  type Finding,
} from '@odysseus/core';
import { reportQualityDigest } from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
const VERSION = 'legacy-page-analysis-coverage-v1';
function limitation(
  limitationId: string,
  code: string,
  fr: string,
  en: string,
  evidenceRefs: string[],
): EvidenceLimitation {
  return { limitationId, code, summary: { fr, en }, reportDestination: 'section-11', evidenceRefs };
}
export function adaptLegacyAuditEvidence(input: {
  manifest: AuditManifest;
  findings: Finding[];
}): ApprovedAuditEvidencePayload {
  const { manifest, findings } = input;
  assertSufficientCrawlCoverage({
    pages: manifest.pages,
    ...(manifest.crawl.sitemapCoverage !== undefined
      ? { sitemapCoverage: manifest.crawl.sitemapCoverage }
      : {}),
  });
  const provenance = buildFindingsProvenance(findings);
  assertFindingsProvenance(manifest.findingsProvenance, provenance, 'manifest');
  if (findings.some((f) => f.auditId !== manifest.auditId))
    throw new Error('Legacy evidence rejected: finding belongs to another audit');
  if (manifest.pages.some((p) => p.status === 'error'))
    throw new Error('Legacy evidence rejected: unresolved scanner page error');
  if ((manifest.crawl.sitemapCoverage?.failedSitemapCount ?? 0) > 0)
    throw new Error('Legacy evidence rejected: unresolved sitemap failure');
  for (const page of manifest.pages) {
    const coverage = page.analysisCoverage;
    if (!coverage || page.status !== 'visited') continue;
    for (const pass of ['rendered', 'axe', 'extended'] as const)
      if (coverage.passes[pass].outcome !== 'completed')
        throw new Error(
          `Legacy evidence rejected: ${pass} is ${coverage.passes[pass].outcome} for ${page.url}`,
        );
  }
  const limitations = [
    limitation(
      'legacy-lineage',
      'legacy-evidence-lineage',
      "Cet audit est antérieur au graphe de preuve complet du plan 059 : le rapport s'appuie sur le manifeste et les constats normalisés dont l'intégrité est vérifiée, mais ne prétend pas disposer d'un registre rétrospectif qui n'a jamais été capturé.",
      'This audit predates the complete Plan 059 evidence graph: the report relies on integrity-checked manifest and normalized findings, but does not claim a retrospective ledger that was never captured.',
      [provenance.findingsDigest],
    ),
  ];
  const rawEvidenceSnapshotDigest = reportQualityDigest({
    auditId: manifest.auditId,
    tool: manifest.tool,
    config: manifest.config,
    crawl: manifest.crawl,
    pages: manifest.pages,
    provenance,
  });
  const evidenceCoverageSignature = {
    digest: reportQualityDigest({
      pages: manifest.pages.map((p) => ({
        url: p.url,
        status: p.status,
        coverage: p.analysisCoverage,
      })),
      provenance,
    }),
    scopeSignature: reportQualityDigest({
      siteUrl: manifest.siteUrl,
      startUrl: manifest.crawl.startUrl,
      pages: manifest.pages.map((p) => p.url),
      config: manifest.config,
    }),
    checkRegistryVersion: `findings-schema-${manifest.tool.findingsSchemaVersion}`,
    surfaceRegistryVersion: 'legacy-baseline-only',
    capabilityRegistryVersion: VERSION,
    normalizationContract: provenance.normalizationFingerprint,
  };
  const auditEvidenceSnapshotDigest = reportQualityDigest({
    rawEvidenceSnapshotDigest,
    provenance,
    evidenceCoverageSignature,
  });
  const evidenceQualityAssessmentDigest = reportQualityDigest({
    auditEvidenceSnapshotDigest,
    limitations,
  });
  return {
    approval: {
      auditId: manifest.auditId,
      evidenceEpoch: 0,
      rawEvidenceSnapshotDigest,
      auditEvidenceSnapshotDigest,
      evidenceQualityAssessmentDigest,
      verdict: 'reportable-with-known-limitations',
      limitations,
      evidenceCoverageSignature,
      capabilityRegistryVersion: VERSION,
      approvalMode: 'legacy-adapter',
      approvedAt: new Date().toISOString(),
      approvedBySystemVersion: `${readOdysseusBuildId()}:058-legacy-evaluation-v1`,
    },
    manifest,
    findings,
    mandatoryDisclosures: limitations,
  };
}
