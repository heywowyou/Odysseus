import type { DashboardLanguage } from '../i18n/types';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type { AuditEvidenceQualityResponse } from './audit-detail-types';

export function evidenceStatusTone(
  status: AuditEvidenceQualityResponse['status'],
): 'minor' | 'moderate' | 'neutral' {
  if (status === 'complete') return 'minor';
  if (status === 'limited') return 'moderate';
  return 'neutral';
}

export interface EvidenceLimitationView {
  code: string;
  text: string;
  refCount: number;
}

export function evidenceLimitationViews(
  evidence: AuditEvidenceQualityResponse,
  language: DashboardLanguage,
): EvidenceLimitationView[] {
  return evidence.clientLimitations.map((limitation) => ({
    code: limitation.code,
    text: limitation.summary[language],
    refCount: limitation.evidenceRefs.length,
  }));
}

export interface EvidenceOperationalWarningView {
  code: string;
  text: string;
  refCount: number;
}

export function evidenceOperationalWarningViews(
  evidence: AuditEvidenceQualityResponse,
  language: DashboardLanguage,
): EvidenceOperationalWarningView[] {
  const table = language === 'fr' ? fr.auditDetail.evidenceQuality : en.auditDetail.evidenceQuality;
  return evidence.operationalWarnings.map((warning) => ({
    code: warning.code,
    text:
      table.operationalWarnings[warning.code] ??
      table.unknownOperationalWarning.replace('{code}', warning.code),
    refCount: warning.referenceCount,
  }));
}
