export interface AuditsStrings {
  title: string;
  description: string;
  emptyState: string;
  emptyStateCta: string;
  dateColumn: string;
  siteColumn: string;
  /** Site column text for a multi-URL prospecting job (no single site).
   *  {count} is replaced with the URL count; singular is used only for
   *  count === 1. */
  siteCountSingular: string;
  siteCountPlural: string;
  typeColumn: string;
  statusColumn: string;
  severityColumn: string;
  searchPlaceholder: string;
  statusFilterAll: string;
  sortNewest: string;
  sortOldest: string;
  kpiRunning: string;
  /** Issue #380: same wording as the row status label. */
  kpiNeedsInput: string;
  kpiComplete: string;
  /** Issue #386: same wording as the row status label. */
  kpiReportIssue: string;
  kpiFailed: string;
  /** {time} is replaced by a formatted clock time (lib/format.ts). */
  updatedAt: string;
  /** Shown when audits exist but no row survives search and filters. */
  emptyFilter: string;
  dayGroupCount: string;
  pagePosition: string;
  previousPage: string;
  nextPage: string;
  /** Accessible name of the sort select; the options carry the visible
   *  copy. */
  sortLabel: string;
  /** Job controls of the audits table: stop, delete, clear queue, and
   *  their confirmation dialogs and toasts. */
  stopAction: string;
  deleteAction: string;
  confirmStopTitle: string;
  confirmStopBody: string;
  /** {site} is replaced with the deleted scan's site URL by the page. */
  confirmDeleteTitle: string;
  confirmDeleteBody: string;
  clearQueue: string;
  confirmClearQueueTitle: string;
  /** {count} is replaced with the number of queued scans by the page. */
  confirmClearQueueBody: string;
  stoppedMessage: string;
  deletedMessage: string;
  /** {count} is replaced with the number of cancelled queued scans. */
  queueClearedMessage: string;
  /** Shown when a stop, delete, or clear-queue mutation fails. */
  actionFailed: string;
}

export const audits = {
  fr: {
    title: 'Audits',
    description: 'Historique des scans et accès aux rapports.',
    emptyState: 'Aucun scan pour le moment.',
    emptyStateCta: 'Lancer un premier scan',
    dateColumn: 'Date',
    siteColumn: 'Site',
    siteCountSingular: '{count} site',
    siteCountPlural: '{count} sites',
    typeColumn: 'Type',
    statusColumn: 'Statut',
    severityColumn: 'Gravité',
    searchPlaceholder: 'Rechercher un site…',
    statusFilterAll: 'Tous les statuts',
    sortNewest: 'Plus récents d’abord',
    sortOldest: 'Plus anciens d’abord',
    kpiRunning: 'En cours',
    kpiNeedsInput: 'Action requise',
    kpiComplete: 'Terminés',
    kpiReportIssue: 'Rapports à corriger',
    kpiFailed: 'Échecs',
    updatedAt: 'Actualisé à {time}',
    emptyFilter: 'Aucun audit ne correspond à ces filtres.',
    dayGroupCount: '{count} audit(s)',
    pagePosition: 'Page {page} sur {total}',
    previousPage: 'Page précédente',
    nextPage: 'Page suivante',
    sortLabel: 'Trier',
    stopAction: 'Arrêter',
    deleteAction: 'Supprimer',
    confirmStopTitle: 'Arrêter ce scan ?',
    confirmStopBody:
      'Le scan sera marqué comme arrêté. Le travail en cours s’achève à la fin de la page en cours.',
    confirmDeleteTitle: 'Supprimer ce scan ?',
    confirmDeleteBody:
      'Cette action supprime définitivement le scan {site} : constats, analyses, rapports et fichiers associés. Elle est irréversible.',
    clearQueue: 'Vider les scans en attente',
    confirmClearQueueTitle: 'Vider les scans en attente ?',
    confirmClearQueueBody: '{count} scan(s) en attente seront annulés. Le scan en cours continue.',
    stoppedMessage: 'Scan arrêté. L’arrêt prend effet à la fin de la page en cours.',
    deletedMessage: 'Scan supprimé.',
    queueClearedMessage: '{count} scan(s) en attente annulés.',
    actionFailed: 'L’action a échoué. Réessayez.',
  },
  en: {
    title: 'Audits',
    description: 'Scan history and access to reports.',
    emptyState: 'No scans yet.',
    emptyStateCta: 'Run a first scan',
    dateColumn: 'Date',
    siteColumn: 'Site',
    siteCountSingular: '{count} site',
    siteCountPlural: '{count} sites',
    typeColumn: 'Type',
    statusColumn: 'Status',
    severityColumn: 'Severity',
    searchPlaceholder: 'Search a site…',
    statusFilterAll: 'All statuses',
    sortNewest: 'Newest first',
    sortOldest: 'Oldest first',
    kpiRunning: 'Running',
    kpiNeedsInput: 'Needs input',
    kpiComplete: 'Complete',
    kpiReportIssue: 'Report issues',
    kpiFailed: 'Failed',
    updatedAt: 'Updated at {time}',
    emptyFilter: 'No audits match these filters.',
    dayGroupCount: '{count} audit(s)',
    pagePosition: 'Page {page} of {total}',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    sortLabel: 'Sort',
    stopAction: 'Stop',
    deleteAction: 'Delete',
    confirmStopTitle: 'Stop this scan?',
    confirmStopBody:
      'The scan will be marked as stopped. Work in progress finishes at the end of the current page.',
    confirmDeleteTitle: 'Delete this scan?',
    confirmDeleteBody:
      'This permanently deletes the scan {site}: findings, analyses, reports and related files. It cannot be undone.',
    clearQueue: 'Clear waiting queue',
    confirmClearQueueTitle: 'Clear the waiting queue?',
    confirmClearQueueBody: '{count} waiting scan(s) will be cancelled. The running scan continues.',
    stoppedMessage: 'Scan stopped. The stop takes effect at the end of the current page.',
    deletedMessage: 'Scan deleted.',
    queueClearedMessage: '{count} queued scan(s) cancelled.',
    actionFailed: 'The action failed. Try again.',
  },
} satisfies { fr: AuditsStrings; en: AuditsStrings };
