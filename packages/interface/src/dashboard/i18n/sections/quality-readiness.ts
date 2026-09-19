import type {
  OperatorEvidenceReadiness,
  OperatorReportReadiness,
} from '../../../operator/contract';

/**
 * Plan 060: copy for the two artifact-readiness axes the server projects
 * in the operator snapshot. Each table is a Record over the server enum,
 * so a new readiness state without copy in both languages fails the
 * dashboard typecheck rather than rendering a raw code. Labels name the
 * state; descriptions explain it in operator vocabulary (plan 060 §4) and
 * belong in detail disclosures, never in dense list rows.
 */
export interface QualityReadinessStrings {
  evidence: Record<OperatorEvidenceReadiness, { label: string; description: string }>;
  report: Record<OperatorReportReadiness, { label: string; description: string }>;
}

export const qualityReadiness = {
  fr: {
    evidence: {
      unavailable: {
        label: 'Diagnostic indisponible',
        description:
          'Le diagnostic détaillé des données de scan n’est pas disponible. Le rapport reste régi par ses constats et contrôles de provenance.',
      },
      'legacy-unknown': {
        label: 'Diagnostic historique inconnu',
        description:
          'Cet audit date d’avant le diagnostic détaillé : sa qualité n’est ni supposée complète ni invalidée.',
      },
      building: {
        label: 'Diagnostic en cours',
        description: 'Les données du scan sont encore en cours d’assemblage et de diagnostic.',
      },
      limited: {
        label: 'Données exploitables avec limites',
        description:
          'Le scan reste exploitable ; des limites explicites réduisent seulement les affirmations concernées.',
      },
      complete: {
        label: 'Données complètes',
        description: 'Le diagnostic ne signale aucune limite client connue pour les données du scan.',
      },
      superseded: {
        label: 'Données remplacées',
        description:
          'Une observation plus récente remplace ces données ; elles restent consultables en historique.',
      },
    },
    report: {
      absent: {
        label: 'Pas de rapport contrôlé',
        description:
          'Aucun rapport n’a encore été produit par le pipeline de contrôle qualité pour cet audit.',
      },
      producing: {
        label: 'Rapport en production',
        description: 'Le rapport est en cours de rédaction, relecture et rendu contrôlé.',
      },
      'needs-attention': {
        label: 'Rapport à examiner',
        description:
          'La production du rapport a besoin d’une décision de votre part pour continuer.',
      },
      'quality-approved': {
        label: 'Rapport validé par les contrôles',
        description:
          'Le rapport a passé tous les contrôles automatiques. Il reste privé : il n’est pas approuvé pour une livraison client.',
      },
      'awaiting-operator-approval': {
        label: 'Rapport en attente d’approbation',
        description:
          'Une livraison a été mise en revue : le lot exact préparé attend votre approbation explicite.',
      },
      'operator-approved': {
        label: 'Rapport approuvé',
        description:
          'Vous avez approuvé ce lot bilingue exact. Il n’est pas encore le rapport actif pour la livraison.',
      },
      active: {
        label: 'Rapport actif',
        description: 'Ce lot approuvé est le rapport client actif, prêt pour la livraison.',
      },
      failed: {
        label: 'Échec de production du rapport',
        description:
          'La production du rapport a échoué. Les preuves, elles, ne sont pas remises en cause.',
      },
      superseded: {
        label: 'Rapport remplacé',
        description:
          'Une itération plus récente remplace ce rapport ; il reste consultable en historique.',
      },
    },
  },
  en: {
    evidence: {
      unavailable: {
        label: 'Diagnostic unavailable',
        description:
          'Detailed scan-data diagnostics are unavailable. The report remains governed by its findings and provenance checks.',
      },
      'legacy-unknown': {
        label: 'Historical diagnostic unknown',
        description:
          'This audit predates detailed diagnostics: its quality is neither assumed complete nor invalidated.',
      },
      building: {
        label: 'Diagnostics building',
        description: 'Scan data is still being assembled and diagnosed.',
      },
      limited: {
        label: 'Usable with limitations',
        description:
          'The scan remains usable; explicit limitations narrow only the claims they affect.',
      },
      complete: {
        label: 'Data complete',
        description: 'Diagnostics report no known client limitation for the scan data.',
      },
      superseded: {
        label: 'Data superseded',
        description: 'A newer observation replaces this data; it remains readable in history.',
      },
    },
    report: {
      absent: {
        label: 'No quality-controlled report',
        description: 'No report has been produced by the quality pipeline for this audit yet.',
      },
      producing: {
        label: 'Report in production',
        description: 'The report is being written, reviewed and rendered under quality control.',
      },
      'needs-attention': {
        label: 'Report needs review',
        description: 'Report production needs one of your decisions to continue.',
      },
      'quality-approved': {
        label: 'Passed quality checks',
        description:
          'The report passed every automated check. It stays private: it is not approved for client delivery.',
      },
      'awaiting-operator-approval': {
        label: 'Awaiting your approval',
        description:
          'A delivery was brought to review: the exact prepared bundle awaits your explicit approval.',
      },
      'operator-approved': {
        label: 'Report approved',
        description:
          'You approved this exact bilingual bundle. It is not yet the active report for delivery.',
      },
      active: {
        label: 'Active report',
        description: 'This approved bundle is the active client report, ready for delivery.',
      },
      failed: {
        label: 'Report production failed',
        description: 'Report production failed. The evidence itself is not put in question.',
      },
      superseded: {
        label: 'Report superseded',
        description: 'A newer iteration replaces this report; it remains readable in history.',
      },
    },
  },
} satisfies { fr: QualityReadinessStrings; en: QualityReadinessStrings };
