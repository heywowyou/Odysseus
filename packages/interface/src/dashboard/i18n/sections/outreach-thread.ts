export interface OutreachThreadStrings {
  description: string;
  generateFirstEmail: string;
  generateFollowUp: string;
  touchLabel: string;
  followUpCreated: string;
  /** One generic refusal toast for every typed refusal code, the same
   *  discipline prospect-detail.tsx already uses for its review action:
   *  the private single-operator console shows one message, not a
   *  per-code table that would have to track two orchestrators' refusal
   *  unions. */
  actionRefused: string;
  actionError: string;
}

export const outreachThread = {
  fr: {
    description: 'Rédiger le premier email ou une relance due pour ce prospect.',
    generateFirstEmail: 'Générer le premier email',
    generateFollowUp: 'Générer une relance',
    touchLabel: 'Étape',
    followUpCreated: 'Relance rédigée : relisez-la dans la section Emails de cette fiche.',
    actionRefused: 'Rien n’a été rédigé ; l’orchestrateur a refusé cette action.',
    actionError: 'Impossible de terminer cette action.',
  },
  en: {
    description: 'Draft the first email or a due follow-up for this prospect.',
    generateFirstEmail: 'Generate first email',
    generateFollowUp: 'Generate follow-up',
    touchLabel: 'Step',
    followUpCreated: 'Follow-up drafted: review it in the Emails section of this page.',
    actionRefused: 'Nothing was drafted; the orchestrator declined this action.',
    actionError: 'Could not complete this action.',
  },
} satisfies { fr: OutreachThreadStrings; en: OutreachThreadStrings };
