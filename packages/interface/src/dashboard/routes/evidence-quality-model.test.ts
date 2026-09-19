import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  evidenceLimitationViews,
  evidenceOperationalWarningViews,
  evidenceStatusTone,
} from './evidence-quality-model';
import type { AuditEvidenceQualityResponse } from './audit-detail-types';

const LIMITED: AuditEvidenceQualityResponse = {
  status: 'limited',
  clientLimitations: [
    {
      limitationId: 'limitation:site',
      code: 'site-level-unknown',
      summary: { fr: 'Vérification indisponible.', en: 'Check unavailable.' },
      reportDestination: 'section-11',
      evidenceRefs: ['site:a', 'site:b'],
    },
  ],
  operationalWarnings: [{ code: 'environment-unapproved', referenceCount: 1 }],
};

describe('Plan 068 evidence-quality model', () => {
  it('uses availability tones rather than approval verdict tones', () => {
    expect(evidenceStatusTone('complete')).toBe('minor');
    expect(evidenceStatusTone('limited')).toBe('moderate');
    expect(evidenceStatusTone('unavailable')).toBe('neutral');
  });

  it('renders the canonical bilingual limitation supplied by the server', () => {
    expect(evidenceLimitationViews(LIMITED, 'fr')).toEqual([
      { code: 'site-level-unknown', text: 'Vérification indisponible.', refCount: 2 },
    ]);
    expect(evidenceLimitationViews(LIMITED, 'en')[0]?.text).toBe('Check unavailable.');
  });

  it('keeps operational warnings separate from client limitations', () => {
    expect(evidenceOperationalWarningViews(LIMITED, 'fr')).toEqual([
      {
        code: 'environment-unapproved',
        text: fr.auditDetail.evidenceQuality.operationalWarnings['environment-unapproved'],
        refCount: 1,
      },
    ]);
    expect(evidenceOperationalWarningViews(LIMITED, 'en')[0]?.text).toBe(
      en.auditDetail.evidenceQuality.operationalWarnings['environment-unapproved'],
    );
  });

  it('contains no evidence approval or non-approval vocabulary in either locale', () => {
    expect(JSON.stringify(fr.auditDetail.evidenceQuality).toLowerCase()).not.toContain('approb');
    expect(JSON.stringify(en.auditDetail.evidenceQuality).toLowerCase()).not.toContain('approv');
  });

  it('falls back to the stable warning code when a future operational warning appears', () => {
    const future = {
      ...LIMITED,
      operationalWarnings: [{ code: 'future-warning', referenceCount: 3 }],
    };
    expect(evidenceOperationalWarningViews(future, 'en')[0]?.text).toBe(
      'Operational diagnostic unavailable (future-warning).',
    );
  });
});
