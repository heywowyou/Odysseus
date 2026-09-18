import type { AttentionKind, AttentionSeverity } from '../../../operator/contract';

/**
 * Plan 060 §8: copy for the human-attention items the server projects.
 * Tables are Records over the server enums, so a new kind or severity
 * without both languages fails the dashboard typecheck. Kind labels name
 * the decision needed; the row's subject, since-date and one safe action
 * come from the item itself.
 */
export interface AttentionStrings {
  kinds: Record<AttentionKind, string>;
  severities: Record<AttentionSeverity, string>;
  /** Shown as the row's age. {since} is a formatted date. */
  since: string;
}

export const attention = {
  fr: {
    kinds: {
      'evidence-operator-resolution': 'Vérification des preuves : une décision est nécessaire',
      'report-quality-review': 'Contrôle qualité du rapport : une relecture est nécessaire',
      'report-delivery-approval': 'Livraison en revue : approuvez le lot exact avant envoi client',
      'work-recovery-choice': 'Un travail est bloqué : choisissez la reprise',
    },
    severities: {
      'action-required': 'Décision demandée',
      blocking: 'Bloquant',
    },
    since: 'Depuis le {since}',
  },
  en: {
    kinds: {
      'evidence-operator-resolution': 'Evidence verification: a decision is needed',
      'report-quality-review': 'Report quality check: a review is needed',
      'report-delivery-approval': 'Delivery in review: approve the exact bundle before sending',
      'work-recovery-choice': 'Work is stopped: choose how to resume',
    },
    severities: {
      'action-required': 'Decision needed',
      blocking: 'Blocking',
    },
    since: 'Since {since}',
  },
} satisfies { fr: AttentionStrings; en: AttentionStrings };
