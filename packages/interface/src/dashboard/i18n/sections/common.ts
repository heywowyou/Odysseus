import type { JobStatus } from '../../lib/api-types';

export interface CommonStrings {
  severityLabels: { critical: string; serious: string; moderate: string; minor: string };
  statusLabels: Record<JobStatus, string>;
  /** camelCase keys mirror the API job types displayed by the dashboard.
   *  Internal batch jobs keep a neutral label if opened directly; the
   *  ordinary scan form exposes only the three public intents. */
  typeLabels: {
    fullAudit: string;
    prospecting: string;
    hotelPrescan: string;
    outreachFullScan: string;
  };
  viewDetails: string;
  error: string;
  loading: string;
  retry: string;
  cancel: string;
  /** Shown by stub routes only; removed once every page is rebuilt. */
  comingSoon: string;
  /** Primary line for any failed request; the technical error string is
   *  demoted to a secondary detail line by the pages. */
  requestFailed: string;
  /** Catch-all shown instead of an unrecognized vocabulary code. */
  vocabularyFallback: string;
  /** {minutes}, {hours} and {days} are replaced with counts by
   *  lib/format.ts's formatRelativeTime. */
  relativeTime: {
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
  };
  /** List rows for prospecting jobs have no single site; this stands in
   *  for the site column. */
  unknownSite: string;
  /** Marker rendered in place of a count whose backing data failed to
   *  load, so unknown never reads as a confident zero. */
  valueUnavailable: string;
  /** Legend of the coverage strip. These are the charter's own coverage
   *  terms and they are not interchangeable: a page can be inventoried
   *  without being content-checked, and content-checked without being
   *  performance-measured. Omitted URLs were never inventoried at all, so
   *  the strip keeps them outside the inventory. */
  coverage: {
    caption: string;
    measured: string;
    checked: string;
    reached: string;
    failed: string;
    omitted: string;
  };
}

export const common = {
  fr: {
    severityLabels: {
      critical: 'Critique',
      serious: 'Sérieux',
      moderate: 'Modéré',
      minor: 'Mineur',
    },
    statusLabels: {
      queued: 'En attente',
      running: 'En cours',
      complete: 'Terminé',
      failed: 'Échoué',
      cancelled: 'Arrêté',
      'needs-input': 'Action requise',
    },
    typeLabels: {
      fullAudit: 'Scan complet',
      prospecting: 'Traitement interne',
      hotelPrescan: 'Contrôle rapide',
      outreachFullScan: 'Scan de prospection (ancien)',
    },
    viewDetails: 'Voir le détail',
    error: 'Erreur',
    loading: 'Chargement…',
    retry: 'Réessayer',
    cancel: 'Annuler',
    comingSoon: 'Cette page arrive bientôt.',
    /** Premier message de toute requête en échec ; le détail technique est
     *  relégué sur une ligne secondaire par les pages. */
    requestFailed: 'La requête a échoué. Réessayez.',
    /** Terme général affiché à la place d’un code de vocabulaire inconnu. */
    vocabularyFallback: 'Autre',
    relativeTime: {
      justNow: 'à l’instant',
      minutesAgo: 'il y a {minutes} min',
      hoursAgo: 'il y a {hours} h',
      daysAgo: 'il y a {days} j',
    },
    unknownSite: 'Site inconnu',
    valueUnavailable: 'Indisponible',
    coverage: {
      caption: 'Couverture des URLs de cet audit',
      measured: 'Performances mesurées',
      checked: 'Contenu vérifié',
      reached: 'Inventoriées',
      failed: 'En échec',
      omitted: 'Écartées',
    },
  },
  en: {
    severityLabels: {
      critical: 'Critical',
      serious: 'Serious',
      moderate: 'Moderate',
      minor: 'Minor',
    },
    statusLabels: {
      queued: 'Queued',
      running: 'Running',
      complete: 'Complete',
      failed: 'Failed',
      cancelled: 'Cancelled',
      'needs-input': 'Needs input',
    },
    typeLabels: {
      fullAudit: 'Full scan',
      prospecting: 'Internal processing',
      hotelPrescan: 'Quick check',
      outreachFullScan: 'Outreach scan (legacy)',
    },
    viewDetails: 'View details',
    error: 'Error',
    loading: 'Loading…',
    retry: 'Retry',
    cancel: 'Cancel',
    comingSoon: 'This page is coming soon.',
    /** Primary line for any failed request; the technical error string is
     *  demoted to a secondary detail line by the pages. */
    requestFailed: 'The request failed. Try again.',
    /** Catch-all shown instead of an unrecognized vocabulary code. */
    vocabularyFallback: 'Other',
    relativeTime: {
      justNow: 'just now',
      minutesAgo: '{minutes} min ago',
      hoursAgo: '{hours} h ago',
      daysAgo: '{days} d ago',
    },
    unknownSite: 'Unknown site',
    valueUnavailable: 'Unavailable',
    coverage: {
      caption: 'URL coverage of this audit',
      measured: 'Performance measured',
      checked: 'Content checked',
      reached: 'Inventoried',
      failed: 'Failed',
      omitted: 'Left out',
    },
  },
} satisfies { fr: CommonStrings; en: CommonStrings };
