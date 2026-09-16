import type { TodoRowAction, TodoRowKind } from '../../lib/api-types';

export interface ATraiterStrings {
  title: string;
  description: string;
  /** Column headers of the merged to-do table (plan 045 stage 3.3). */
  table: {
    subjectHeader: string;
    actionHeader: string;
    sinceHeader: string;
  };
  /** Badge label naming which prospect queue a row comes from. */
  kinds: Record<TodoRowKind, string>;
  /** One concrete action per stable code the server returns; never a
   *  ready-made sentence from the API. */
  actions: Record<TodoRowAction, string>;
  /** The muted one-liner the table renders instead of an empty-state
   *  block when every source is empty. */
  empty: string;
  syncMailbox: string;
  syncMailboxDone: string;
  syncMailboxNotConfigured: string;
  syncMailboxFailed: string;
  /** Kept for compatibility with the existing translation shape while
   *  batch entry points remain retired from the prospect-only inbox. */
  batch: {
    draftBatchLabel: string;
    draftBatchButton: string;
    followUpBatchLabel: string;
    followUpBatchButton: string;
    limitLabel: string;
    started: string;
    error: string;
  };
}

export const aTraiter = {
  fr: {
    title: 'À traiter',
    description:
      'Ce qui attend une décision : brouillons, réponses et relances. Chaque ligne ouvre la fiche du prospect.',
    table: {
      subjectHeader: 'Sujet',
      actionHeader: 'Action',
      sinceHeader: 'Depuis',
    },
    kinds: {
      draft: 'Brouillon',
      reply: 'Réponse',
      'follow-up': 'Relance',
      'first-email': 'Premier email',
      'audit-input': 'Audit à compléter',
    },
    actions: {
      'review-draft': 'Relire le brouillon',
      'record-outcome': 'Enregistrer le résultat',
      'create-follow-up': 'Rédiger la relance',
      'create-first-email': 'Rédiger le premier email',
      'review-audit': 'Compléter l’audit',
    },
    empty: 'Rien n’attend de décision.',
    syncMailbox: 'Synchroniser la boîte mail',
    syncMailboxDone:
      'Boîte mail synchronisée : {sent} envoi(s) confirmé(s), {replies} réponse(s) ou retour(s), {review} à vérifier.',
    syncMailboxNotConfigured: 'Aucune boîte mail n’est configurée sur cette machine.',
    syncMailboxFailed: 'La boîte mail n’a pas pu être synchronisée. Réessayez.',
    batch: {
      draftBatchLabel: 'Rédiger les premiers emails pour les hôtels sélectionnés',
      draftBatchButton: 'Rédiger les premiers emails',
      followUpBatchLabel: 'Rédiger les relances actuellement dues',
      followUpBatchButton: 'Rédiger les relances dues',
      limitLabel: 'Limite',
      started: 'Tâche démarrée. Elle apparaîtra comme nouveaux brouillons une fois terminée.',
      error: 'Impossible de démarrer la tâche.',
    },
  },
  en: {
    title: 'To do',
    description:
      'What waits for a decision: drafts, replies, and follow-ups. Every row opens the prospect page.',
    table: {
      subjectHeader: 'Subject',
      actionHeader: 'Action',
      sinceHeader: 'Since',
    },
    kinds: {
      draft: 'Draft',
      reply: 'Reply',
      'follow-up': 'Follow-up',
      'first-email': 'First email',
      'audit-input': 'Audit needs input',
    },
    actions: {
      'review-draft': 'Review the draft',
      'record-outcome': 'Record the outcome',
      'create-follow-up': 'Draft the follow-up',
      'create-first-email': 'Draft the first email',
      'review-audit': 'Review the audit',
    },
    empty: 'Nothing is waiting for a decision.',
    syncMailbox: 'Sync mailbox',
    syncMailboxDone:
      'Mailbox synced: {sent} confirmed send(s), {replies} reply(ies) or bounce(s), {review} to check.',
    syncMailboxNotConfigured: 'No mailbox is configured on this machine.',
    syncMailboxFailed: 'The mailbox could not be synced. Try again.',
    batch: {
      draftBatchLabel: 'Draft first emails for the selected hotels',
      draftBatchButton: 'Draft first emails',
      followUpBatchLabel: 'Draft follow-ups currently due',
      followUpBatchButton: 'Draft due follow-ups',
      limitLabel: 'Limit',
      started: 'Job started. It will appear as new drafts once it finishes.',
      error: 'Could not start the job.',
    },
  },
} satisfies { fr: ATraiterStrings; en: ATraiterStrings };
