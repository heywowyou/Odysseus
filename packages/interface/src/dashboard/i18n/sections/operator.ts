export interface OperatorStrings {
  paginationPrevious: string;
  paginationNext: string;
  /** {page} and {pages} are replaced with counts by the page. */
  paginationPageOf: string;
  /** Accessible name of every pagination nav landmark. */
  paginationLabel: string;
  accept: string;
  reject: string;
  accepted: string;
  rejected: string;
  /** Shown when a prospect action fails. */
  actionError: string;
  provenanceLabel: string;
  /** Issue #183: the fiche's provenance line shows this instead of the raw
   *  `dashboard-review` fallback constant the backend stores when a
   *  dashboard decision carries no free-text reason. */
  provenanceReasonFallback: string;
  notFound: string;
  backToProspects: string;
}

export const operator = {
  fr: {
    paginationPrevious: 'Précédent',
    paginationNext: 'Suivant',
    paginationPageOf: 'Page {page} sur {pages}',
    paginationLabel: 'Pagination',
    accept: 'Accepter',
    reject: 'Rejeter',
    accepted: 'Accepté',
    rejected: 'Rejeté',
    actionError: 'L’action a échoué. Réessayez.',
    provenanceLabel: 'Origine des données',
    provenanceReasonFallback: 'décision prise depuis le tableau de bord',
    notFound: 'Introuvable.',
    backToProspects: 'Retour aux prospects',
  },
  en: {
    paginationPrevious: 'Previous',
    paginationNext: 'Next',
    paginationPageOf: 'Page {page} of {pages}',
    paginationLabel: 'Pagination',
    accept: 'Accept',
    reject: 'Reject',
    accepted: 'Accepted',
    rejected: 'Rejected',
    actionError: 'The action failed. Try again.',
    provenanceLabel: 'Data source',
    provenanceReasonFallback: 'decision made from the dashboard',
    notFound: 'Not found.',
    backToProspects: 'Back to prospects',
  },
} satisfies { fr: OperatorStrings; en: OperatorStrings };
