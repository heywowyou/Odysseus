export interface ScanQueueStrings {
  /** Prospects page selection and its bulk action. */
  selectAria: string;
  selectPageAria: string;
  /** {count} is replaced with the number of selected prospects. */
  selectedCount: string;
  clearSelection: string;
  queueAction: string;
  /** The review dialog. */
  dialogTitle: string;
  dialogDescription: string;
  orderColumn: string;
  prospectColumn: string;
  websiteColumn: string;
  scanColumn: string;
  /** {name} is replaced with the prospect name. */
  moveUpAria: string;
  moveDownAria: string;
  /** {names} is replaced with a comma-separated list of prospect names. */
  withoutWebsite: string;
  sharedOptionsHint: string;
  /** {count} is replaced with the number of sites to queue. */
  submitAction: string;
  /** Shown when the request itself failed, so the operator checks the queue
   *  before sending again (a resubmission skips what was already queued). */
  submitFailed: string;
  /** The result view. {queued}, {skipped} and {rejected} are counts. */
  resultSummary: string;
  outcomeQueued: string;
  outcomeSkippedActive: string;
  outcomeRejectedInvalidUrl: string;
  outcomeRejectedSuppressed: string;
  outcomeRejectedProspectUnavailable: string;
  openQueueAction: string;
  closeAction: string;
  /** Audits page queue section. */
  sectionTitle: string;
  sectionDescription: string;
  runningHeading: string;
  /** {count} is replaced with the number of waiting scans. */
  upNextHeading: string;
  noRunning: string;
  noWaiting: string;
  removeAction: string;
  confirmRemoveTitle: string;
  /** {site} is replaced with the scan's site. */
  confirmRemoveBody: string;
  removedMessage: string;
}

export const scanQueue = {
  fr: {
    selectAria: 'Sélectionner {name}',
    selectPageAria: 'Sélectionner tous les prospects de la page',
    selectedCount: '{count} sélectionné(s)',
    clearSelection: 'Désélectionner',
    queueAction: 'Mettre des scans en file',
    dialogTitle: 'Mettre des scans en file d’attente',
    dialogDescription:
      'Les scans s’exécutent l’un après l’autre, dans cet ordre, y compris lorsque le tableau de bord est fermé. Un scan qui échoue ou demande une saisie n’arrête pas les suivants.',
    orderColumn: 'Ordre',
    prospectColumn: 'Prospect',
    websiteColumn: 'Site',
    scanColumn: 'Scan',
    moveUpAria: 'Monter {name}',
    moveDownAria: 'Descendre {name}',
    withoutWebsite: 'Sans site web exploitable, non mis en file : {names}.',
    sharedOptionsHint: 'Ces options s’appliquent à tous les sites de la file.',
    submitAction: 'Mettre {count} scan(s) en file',
    submitFailed:
      'L’envoi a échoué. Vérifiez la file des audits avant de renvoyer : les sites déjà en file seront ignorés.',
    resultSummary: '{queued} en file, {skipped} ignoré(s), {rejected} refusé(s).',
    outcomeQueued: 'En file',
    outcomeSkippedActive: 'Ignoré : un scan est déjà en file ou en cours pour ce site.',
    outcomeRejectedInvalidUrl: 'Refusé : l’adresse du site n’est pas valide.',
    outcomeRejectedSuppressed: 'Refusé : ce site figure sur la liste à ne pas contacter.',
    outcomeRejectedProspectUnavailable:
      'Refusé : ce prospect est archivé ou introuvable ; restaurez-le avant de lancer un scan.',
    openQueueAction: 'Voir la file',
    closeAction: 'Fermer',
    sectionTitle: 'File de scans',
    sectionDescription:
      'Le travail à venir. Les scans s’exécutent un par un sur le serveur, même navigateur fermé.',
    runningHeading: 'En cours',
    upNextHeading: 'À suivre ({count})',
    noRunning: 'Aucun scan en cours.',
    noWaiting: 'Aucun scan en attente.',
    removeAction: 'Retirer de la file',
    confirmRemoveTitle: 'Retirer ce scan de la file ?',
    confirmRemoveBody:
      'Le scan de {site} ne démarrera pas. Il reste dans l’historique comme arrêté.',
    removedMessage: 'Scan retiré de la file.',
  },
  en: {
    selectAria: 'Select {name}',
    selectPageAria: 'Select every prospect on this page',
    selectedCount: '{count} selected',
    clearSelection: 'Clear selection',
    queueAction: 'Queue scans',
    dialogTitle: 'Queue scans',
    dialogDescription:
      'Scans run one after another, in this order, even with the dashboard closed. A scan that fails or needs input does not stop the ones after it.',
    orderColumn: 'Order',
    prospectColumn: 'Prospect',
    websiteColumn: 'Website',
    scanColumn: 'Scan',
    moveUpAria: 'Move {name} up',
    moveDownAria: 'Move {name} down',
    withoutWebsite: 'No usable website, not queued: {names}.',
    sharedOptionsHint: 'These options apply to every site in the batch.',
    submitAction: 'Queue {count} scan(s)',
    submitFailed:
      'Submission failed. Check the audits queue before sending again: sites already queued will be skipped.',
    resultSummary: '{queued} queued, {skipped} skipped, {rejected} rejected.',
    outcomeQueued: 'Queued',
    outcomeSkippedActive: 'Skipped: a scan is already queued or running for this site.',
    outcomeRejectedInvalidUrl: 'Rejected: the website address is not valid.',
    outcomeRejectedSuppressed: 'Rejected: this site is on the do-not-contact list.',
    outcomeRejectedProspectUnavailable:
      'Rejected: this prospect is archived or missing; restore it before scanning.',
    openQueueAction: 'Open the queue',
    closeAction: 'Close',
    sectionTitle: 'Scan queue',
    sectionDescription:
      'Work that will happen. Scans run one at a time on the server, even with the browser closed.',
    runningHeading: 'Running',
    upNextHeading: 'Up next ({count})',
    noRunning: 'No scan running.',
    noWaiting: 'No scan waiting.',
    removeAction: 'Remove from queue',
    confirmRemoveTitle: 'Remove this scan from the queue?',
    confirmRemoveBody: 'The scan of {site} will not start. It stays in the history as stopped.',
    removedMessage: 'Scan removed from the queue.',
  },
} satisfies { fr: ScanQueueStrings; en: ScanQueueStrings };
