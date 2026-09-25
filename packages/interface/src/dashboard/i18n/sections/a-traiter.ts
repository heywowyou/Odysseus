import type { AttentionTodoRowKind, TodoRowAction, TodoRowKind } from '../../lib/api-types';

/** Kinds the plan 060 §8 attention contract owns reuse strings.attention
 *  copy; this section names only the classic prospect-work kinds. */
type ProspectWorkTodoKind = Exclude<TodoRowKind, AttentionTodoRowKind>;

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
  kinds: Record<ProspectWorkTodoKind, string>;
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
  /** Issue #533: the current campaign's funnel, counts only. */
  funnel: {
    heading: string;
    campaign: string;
    firstTouchSent: string;
    replied: string;
    bounced: string;
    optedOut: string;
    won: string;
    note: string;
  };
  overview: {
    heading: string;
    auditedProspects: string;
    activeProspects: string;
    actionableProspects: string;
    actionableItems: string;
    attentionItems: string;
    mailbox: string;
    mailboxConfigured: string;
    mailboxNotConfigured: string;
    mailboxLastSync: string;
    mailboxNeverSynced: string;
    kindFilterLabel: string;
    allKinds: string;
    filteredEmpty: string;
    reconciliation: string;
    kindLabels: Record<TodoRowKind, string>;
  };
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
      'Ce qui attend une décision : brouillons, réponses, relances et revues de rapports. Chaque ligne ouvre la fiche du prospect ou l’audit concerné.',
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
      'audit-report': 'Rapport à corriger',
    },
    actions: {
      'review-draft': 'Relire le brouillon',
      'record-outcome': 'Enregistrer le résultat',
      'create-follow-up': 'Rédiger la relance',
      'create-first-email': 'Rédiger le premier email',
      'review-audit': 'Confirmer les informations',
      'regenerate-report': 'Régénérer le rapport',
      'review-report': 'Relire le rapport',
    },
    empty: 'Rien n’attend de décision.',
    syncMailbox: 'Synchroniser la boîte mail',
    syncMailboxDone:
      'Boîte mail synchronisée : {sent} envoi(s) confirmé(s), {replies} réponse(s) ou retour(s), {review} à vérifier.',
    syncMailboxNotConfigured: 'Aucune boîte mail n’est configurée sur cette machine.',
    syncMailboxFailed: 'La boîte mail n’a pas pu être synchronisée. Réessayez.',
    funnel: {
      heading: 'Résultats de la campagne',
      campaign: 'Campagne {campaign}',
      firstTouchSent: 'Premiers emails envoyés',
      replied: 'Réponses',
      bounced: 'Rebonds',
      optedOut: 'Désinscriptions',
      won: 'Gagnés',
      note: 'Compteurs seuls. Les fils expirent après 90 jours : exportez-les avant avec « odysseus outreach-funnel --json ».',
    },
    overview: {
      heading: 'Vue de campagne',
      auditedProspects: 'Prospects audités',
      activeProspects: 'Prospects actifs',
      actionableProspects: 'Prospects avec une action',
      actionableItems: 'Actions ouvertes',
      attentionItems: 'Décisions urgentes',
      mailbox: 'Boîte mail',
      mailboxConfigured: 'Configurée · synchronisation manuelle',
      mailboxNotConfigured: 'Non configurée',
      mailboxLastSync: 'Dernière conversation synchronisée',
      mailboxNeverSynced: 'Aucune conversation synchronisée',
      kindFilterLabel: 'Afficher',
      allKinds: 'Toutes les actions',
      filteredEmpty: 'Aucune action dans cette catégorie.',
      reconciliation:
        '{audited} prospects audités · {actions} actions ouvertes. Un audit n’ouvre pas forcément une action, et un prospect peut en ouvrir plusieurs.',
      kindLabels: {
        draft: 'Brouillons',
        reply: 'Réponses',
        'follow-up': 'Relances',
        'first-email': 'Premiers emails',
        'audit-input': 'Audits à compléter',
        'audit-report': 'Rapports à corriger',
        'report-quality-review': 'Revues qualité',
      },
    },
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
      'What waits for a decision: drafts, replies, follow-ups and report reviews. Every row opens the prospect page or audit it belongs to.',
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
      'audit-report': 'Report issue',
    },
    actions: {
      'review-draft': 'Review the draft',
      'record-outcome': 'Record the outcome',
      'create-follow-up': 'Draft the follow-up',
      'create-first-email': 'Draft the first email',
      'review-audit': 'Confirm the details',
      'regenerate-report': 'Regenerate the report',
      'review-report': 'Review the report',
    },
    empty: 'Nothing is waiting for a decision.',
    syncMailbox: 'Sync mailbox',
    syncMailboxDone:
      'Mailbox synced: {sent} confirmed send(s), {replies} reply(ies) or bounce(s), {review} to check.',
    syncMailboxNotConfigured: 'No mailbox is configured on this machine.',
    syncMailboxFailed: 'The mailbox could not be synced. Try again.',
    funnel: {
      heading: 'Campaign results',
      campaign: 'Campaign {campaign}',
      firstTouchSent: 'First emails sent',
      replied: 'Replies',
      bounced: 'Bounces',
      optedOut: 'Opt-outs',
      won: 'Won',
      note: 'Counts only. Threads expire after 90 days: export them first with "odysseus outreach-funnel --json".',
    },
    overview: {
      heading: 'Campaign overview',
      auditedProspects: 'Audited prospects',
      activeProspects: 'Active prospects',
      actionableProspects: 'Prospects with an action',
      actionableItems: 'Open actions',
      attentionItems: 'Urgent decisions',
      mailbox: 'Mailbox',
      mailboxConfigured: 'Configured · manual sync',
      mailboxNotConfigured: 'Not configured',
      mailboxLastSync: 'Last conversation sync',
      mailboxNeverSynced: 'No conversation synced yet',
      kindFilterLabel: 'Show',
      allKinds: 'All actions',
      filteredEmpty: 'No action in this category.',
      reconciliation:
        '{audited} audited prospects · {actions} open actions. An audit does not always create an action, and one prospect can create several.',
      kindLabels: {
        draft: 'Drafts',
        reply: 'Replies',
        'follow-up': 'Follow-ups',
        'first-email': 'First emails',
        'audit-input': 'Audits to complete',
        'audit-report': 'Reports to fix',
        'report-quality-review': 'Quality reviews',
      },
    },
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
