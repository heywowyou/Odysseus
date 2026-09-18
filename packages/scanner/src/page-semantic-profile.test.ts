import { describe, expect, it } from 'vitest';
import { evidenceQualityFixtures } from './evidence-quality-fixtures.js';
import {
  classifyPageSemanticRole,
  PAGE_SEMANTIC_CLASSIFIER_VERSION,
  semanticProfileForPage,
} from './page-semantic-profile.js';
import { auditProfile, HOME, HOME_PROFILE, ROOMS_PROFILE } from './evidence-graph-fixtures.js';
import type { PageAuditProfile } from './page-audit-profile.js';

function profileOf(fixture: {
  url: string;
  signals: readonly { kind: string; detail: string }[];
}): PageAuditProfile {
  return auditProfile(
    fixture.url,
    fixture.signals.map((signal) => ({
      kind: signal.kind as PageAuditProfile['roleSignals'][number]['kind'],
      detail: signal.detail,
    })),
  );
}

describe('page semantic classifier (plan 059 step 26, section 18 Classification/pattern)', () => {
  const rows = Object.entries(evidenceQualityFixtures.semanticRoles);

  it('names the expected role for every section 18 fixture row', () => {
    for (const [name, fixture] of rows) {
      const classification = classifyPageSemanticRole(profileOf(fixture));
      expect(classification.semanticRole, name).toBe(fixture.expectedRole);
      expect(classification.confidence, name).toBe(fixture.expectedConfidence);
    }
  });

  it('records the mechanism that fired in the reason codes', () => {
    const transactional = classifyPageSemanticRole(
      profileOf(evidenceQualityFixtures.semanticRoles.transactional),
    );
    expect(transactional.reasonCodes).toContain('transactional-form-detected');

    const archive = classifyPageSemanticRole(
      profileOf(evidenceQualityFixtures.semanticRoles.archive),
    );
    expect(archive.reasonCodes[0]).toMatch(/^archive-signals:/);

    const commercial = classifyPageSemanticRole(
      profileOf(evidenceQualityFixtures.semanticRoles.commercial),
    );
    expect(commercial.reasonCodes).toEqual(['commercial-json-ld:Hotel']);

    const conflicting = classifyPageSemanticRole(
      profileOf(evidenceQualityFixtures.semanticRoles.conflicting),
    );
    expect(conflicting.reasonCodes).toContain('conflicting-archive-and-content-signals');
    expect(conflicting.reasonCodes).toContain('content-json-ld:Article');
  });

  it('keeps the conflicting role low-confidence and names both sides', () => {
    const conflicting = classifyPageSemanticRole(
      profileOf(evidenceQualityFixtures.semanticRoles.conflicting),
    );
    expect(conflicting.semanticRole).toBe('conflicting');
    expect(conflicting.confidence).toBe('low');
    expect(conflicting.reasonCodes.some((code) => code.startsWith('archive-signals:'))).toBe(true);
  });

  it('never promotes a single weak listing signal to archive', () => {
    const weak = classifyPageSemanticRole(
      auditProfile('https://site-exemple.fr/liste', [
        { kind: 'numbered-pagination-control', detail: '2' },
      ]),
    );
    expect(weak.semanticRole).toBe('unknown');
    expect(weak.confidence).toBe('low');
    expect(weak.reasonCodes).toEqual(['insufficient-archive-signals']);
  });

  it('resolves an overlap by fixed precedence while recording the outvoted mechanism', () => {
    const legalWithForm = classifyPageSemanticRole(
      auditProfile(evidenceQualityFixtures.semanticRoles.legal.url, [
        { kind: 'transactional-form', detail: '1 form(s)' },
      ]),
    );
    expect(legalWithForm.semanticRole).toBe('legal');
    expect(legalWithForm.reasonCodes).toContain('legal-path-url');
    expect(legalWithForm.reasonCodes).toContain('transactional-form-detected:outvoted');
  });

  it('treats a legal page as medium confidence because a URL is naming, not content', () => {
    const legal = classifyPageSemanticRole(profileOf(evidenceQualityFixtures.semanticRoles.legal));
    expect(legal.reasonCodes).toEqual(['legal-path-url']);
    expect(legal.evidenceRefs).toEqual([]);
  });

  it('never lets homepage or operator-seed context become a content role', () => {
    const homepage = classifyPageSemanticRole(
      auditProfile('https://site-exemple.fr/', [
        { kind: 'homepage-url', detail: 'https://site-exemple.fr/' },
      ]),
    );
    expect(homepage.semanticRole).toBe('unknown');

    const seed = classifyPageSemanticRole(
      auditProfile('https://site-exemple.fr/contact', [
        { kind: 'operator-seed', detail: 'https://site-exemple.fr/contact' },
      ]),
    );
    expect(seed.semanticRole).toBe('unknown');
  });

  it('carries the source profile version and its own classifier version', () => {
    const profile = semanticProfileForPage(
      evidenceQualityFixtures.semanticRoles.commercial.url,
      profileOf(evidenceQualityFixtures.semanticRoles.commercial),
    );
    expect(profile.pageAuditProfileVersion).toBe('v1');
    expect(profile.classifierVersion).toBe(PAGE_SEMANTIC_CLASSIFIER_VERSION);
  });
});

describe('semanticProfileForPage (plan 059 step 26)', () => {
  it('produces one explicit unknown profile when signals were never extracted', () => {
    const profile = semanticProfileForPage('https://site-exemple.fr/vague', undefined);
    expect(profile.semanticRole).toBe('unknown');
    expect(profile.confidence).toBe('low');
    expect(profile.reasonCodes).toEqual(['page-audit-profile-absent']);
    expect(profile.pageAuditProfileVersion).toBe('absent');
  });

  it('references the signal kinds a classified role rests on', () => {
    const transactional = semanticProfileForPage(
      evidenceQualityFixtures.semanticRoles.transactional.url,
      profileOf(evidenceQualityFixtures.semanticRoles.transactional),
    );
    expect(transactional.evidenceRefs).toEqual(['transactional-form']);
  });

  it('is deterministic: the same profile hashes to the same digest', () => {
    const first = semanticProfileForPage(HOME, HOME_PROFILE);
    const second = semanticProfileForPage(HOME, HOME_PROFILE);
    expect(second.digest).toBe(first.digest);
  });

  it('classifies the clean fixture rooms page as commercial and the homepage as unknown', () => {
    const rooms = semanticProfileForPage(
      evidenceQualityFixtures.semanticRoles.commercial.url,
      ROOMS_PROFILE,
    );
    expect(rooms.semanticRole).toBe('commercial');

    const home = semanticProfileForPage(HOME, HOME_PROFILE);
    expect(home.semanticRole).toBe('unknown');
    expect(home.reasonCodes).toEqual(['no-role-signals']);
  });
});
