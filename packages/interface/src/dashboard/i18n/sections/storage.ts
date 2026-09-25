export interface StorageStrings {
  heading: string;
  description: string;
  levels: { ok: string; warning: string; danger: string };
  /** Shown under the level for warning and danger only. */
  levelHelp: { warning: string; danger: string };
  /** {used}, {free} and {total} are filled by the page. */
  usage: string;
  unavailable: string;
  lastRunHeading: string;
  noRun: string;
  /** {date}, {trigger}, {audits}, {slimmed}, {versions}, {bytes}. */
  runSummary: string;
  triggers: { sweeper: string; cli: string };
  refused: string;
  /** {count} is the number of failed items. */
  failures: string;
  /** {count} is the number of audits left aside. */
  held: string;
}

export const storage = {
  fr: {
    heading: 'Stockage des audits',
    description: 'Espace disque des fichiers d’audit et dernier nettoyage des versions remplacées.',
    levels: {
      ok: 'Espace suffisant',
      warning: 'Disque rempli aux trois quarts',
      danger: 'Disque presque plein',
    },
    levelHelp: {
      warning:
        'Le nettoyage quotidien retire les versions remplacées, mais le disque continue de se remplir. Surveillez-le.',
      danger:
        'Libérez de l’espace avant le prochain scan : un disque plein fait échouer les scans en cours.',
    },
    usage: '{used} % utilisé, {free} libres sur {total}',
    unavailable: 'L’espace disque ne peut pas être mesuré sur cette machine.',
    lastRunHeading: 'Dernier nettoyage',
    noRun: 'Aucun nettoyage enregistré.',
    runSummary:
      '{date} ({trigger}) : {audits} audit(s) supprimé(s), {slimmed} allégé(s), {versions} version(s) retirée(s), {bytes} libérés.',
    triggers: { sweeper: 'automatique', cli: 'manuel' },
    refused:
      'Refusé : trop d’audits à supprimer d’un coup. Vérifiez la liste avec la commande de rétention, puis lancez-la à la main.',
    failures: '{count} élément(s) en échec, repris au prochain passage.',
    held: '{count} audit(s) laissé(s) de côté : travail en cours ou fichiers absents de cette machine.',
  },
  en: {
    heading: 'Audit storage',
    description: 'Disk space for audit files and the last cleanup of replaced versions.',
    levels: {
      ok: 'Enough space',
      warning: 'Disk three quarters full',
      danger: 'Disk almost full',
    },
    levelHelp: {
      warning:
        'The daily cleanup removes replaced versions, but the disk keeps filling up. Keep an eye on it.',
      danger: 'Free up space before the next scan: a full disk makes running scans fail.',
    },
    usage: '{used}% used, {free} free of {total}',
    unavailable: 'Disk space cannot be measured on this machine.',
    lastRunHeading: 'Last cleanup',
    noRun: 'No cleanup recorded.',
    runSummary:
      '{date} ({trigger}): {audits} audit(s) deleted, {slimmed} slimmed, {versions} version(s) removed, {bytes} freed.',
    triggers: { sweeper: 'automatic', cli: 'manual' },
    refused:
      'Refused: too many audits to delete at once. Check the list with the retention command, then run it by hand.',
    failures: '{count} item(s) failed and will be retried on the next run.',
    held: '{count} audit(s) left aside: work in progress or files not on this machine.',
  },
} satisfies { fr: StorageStrings; en: StorageStrings };
