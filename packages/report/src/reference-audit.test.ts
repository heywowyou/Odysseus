import { describe, expect, it } from 'vitest';
import { buildFindingsProvenance } from '@odysseus/core';
import {
  assertReferenceAuditNoLeaks,
  buildReferenceAuditShowcase,
  findReferenceAuditLeaks,
  REFERENCE_AUDIT_DISCLOSURE_FR,
} from './reference-audit.js';
import { renderReferenceAuditHtml } from './index.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from './test-fixtures.js';
import { normalizeFrenchTypography } from './template/french-typography.js';

describe('reference audit showcase projection', () => {
  it('detaches source identity without mutating the stored inputs', async () => {
    const sourceManifest = await loadSmallSiteManifest();
    const sourceFindings = await loadSmallSiteFindings();
    const sourceAnalysis = await loadSmallSiteAnalysis('fr');
    const first = sourceFindings[0]!;
    sourceManifest.siteSignals = {
      ...(sourceManifest.siteSignals ?? {}),
      address: '12 rue du Client, 75001 Paris',
      phone: '+33 1 23 45 67 89',
      email: 'direction@client-hotel.fr',
    } as NonNullable<typeof sourceManifest.siteSignals>;
    sourceAnalysis.executiveSummary +=
      ' Client Hôtel du Rivage, 12 rue du Client, direction@client-hotel.fr, SIREN 123456789.';
    sourceFindings[0] = {
      ...first,
      elements: [
        {
          pageUrl: first.pageUrls[0]!,
          selector: '#client-hotel-booking-button',
          snippet: '<button id="client-hotel-booking-button">Réserver au Client Hôtel</button>',
        },
      ],
    };
    const before = JSON.stringify({ sourceManifest, sourceFindings, sourceAnalysis });

    const showcase = buildReferenceAuditShowcase({
      manifest: sourceManifest,
      findings: sourceFindings,
      analysis: sourceAnalysis,
    });
    const publicJson = JSON.stringify(showcase.bundle);

    expect(publicJson).not.toContain('small-site.test');
    expect(publicJson).not.toContain('client-hotel');
    expect(publicJson).not.toContain('client hôtel');
    expect(publicJson).not.toContain('123456789');
    expect(publicJson).not.toContain('direction@client-hotel.fr');
    expect(publicJson).toContain('www.hotel-exemple.fr');
    expect(publicJson).toContain(REFERENCE_AUDIT_DISCLOSURE_FR);
    expect(showcase.bundle.manifest.siteSignals?.siren).toBe('000000000');
    expect(showcase.bundle.findings[0]?.elements[0]?.selector).toMatch(/data-showcase-/u);
    expect(sourceFindings[0]?.elements[0]?.selector).toBe('#client-hotel-booking-button');
    expect(JSON.stringify({ sourceManifest, sourceFindings, sourceAnalysis })).toBe(before);
  });

  it('refuses source imagery before any report rendering', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    findings[0] = {
      ...findings[0]!,
      elements: [
        {
          pageUrl: findings[0]!.pageUrls[0]!,
          selector: 'img.logo',
          snippet: '<img class="logo" src="/client-logo.png">',
          screenshotRef: 'pages/root/screenshot.png',
        },
      ],
    };

    expect(() => buildReferenceAuditShowcase({ manifest, findings, analysis })).toThrow(
      /image or screenshot/u,
    );
  });

  it('fails a release when a source identity appears in any publication surface', () => {
    const denylist = ['client-hotel.fr', '123456789', 'direction@client-hotel.fr'];
    expect(
      findReferenceAuditLeaks({
        html: '<meta name="author" content="client-hotel.fr">',
        pdfText: '123456789',
        pdfMetadata: { author: 'direction@client-hotel.fr' },
        embeddedObjectNames: ['client-hotel-logo.svg'],
        denylist,
      }),
    ).toEqual(expect.arrayContaining(denylist));
    expect(() =>
      assertReferenceAuditNoLeaks({
        html: 'client-hotel.fr',
        denylist,
      }),
    ).toThrow(/source identity survived/u);
  });

  it('binds the projected analysis to the projected findings', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const showcase = buildReferenceAuditShowcase({ manifest, findings, analysis });
    expect(showcase.bundle.manifest.findingsProvenance).toEqual(
      buildFindingsProvenance(showcase.bundle.findings),
    );
    expect(showcase.bundle.analysis.findingsProvenance).toEqual(
      buildFindingsProvenance(showcase.bundle.findings),
    );
  });

  it('mints synthetic finding ids in the production shape so the appendix column fits', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const showcase = buildReferenceAuditShowcase({ manifest, findings, analysis });
    const ids = showcase.bundle.findings.map((finding) => finding.findingId);
    expect(ids).toEqual(ids.map((_, index) => `f${String(index + 1).padStart(3, '0')}`));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(5);
  });

  it('uses the normal paid-report HTML renderer and carries the disclosure', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const showcase = buildReferenceAuditShowcase({ manifest, findings, analysis });
    const html = await renderReferenceAuditHtml(showcase, {
      renderedAt: new Date('2026-09-20T10:00:00.000Z'),
      rendererBuild: 'test',
    });
    expect(html).toContain('reference-disclosure');
    expect(html).toContain(normalizeFrenchTypography(REFERENCE_AUDIT_DISCLOSURE_FR));
    expect(html).toContain('EXEMPLE PUBLIC');
    expect(html).not.toContain('RAPPORT CONFIDENTIEL');
    assertReferenceAuditNoLeaks({ html, denylist: showcase.sourceDenylist });
  });

  it('does not treat render-input provenance labels as source identity', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const showcase = buildReferenceAuditShowcase({
      manifest,
      findings,
      analysis,
      renderInputs: {
        manualFields: {
          nomCommercial: { value: 'Client Hôtel', provenance: 'operator' },
          raisonSociale: { value: 'Client Hôtel SAS', provenance: 'operator' },
          siren: { value: '123456789', provenance: 'operator' },
          updatedAt: new Date('2026-09-21T00:00:00.000Z'),
        },
      },
    });

    expect(showcase.sourceDenylist).not.toContain('operator');
    expect(showcase.bundle.renderInputs.manualFields?.nomCommercial?.provenance).toBe('operator');
  });
});
