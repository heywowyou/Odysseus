export interface ErrorBoundaryStrings {
  heading: string;
  description: string;
  retryButton: string;
  reloadButton: string;
  homeButton: string;
  routeLabel: string;
  incidentLabel: string;
  copyButton: string;
  copiedLabel: string;
}

export const errorBoundary = {
  fr: {
    heading: 'Une erreur est survenue sur cette page',
    description:
      'Une erreur inattendue a interrompu cette page. Vos données sont en sécurité. Réessayez, ou rechargez la page ; si le problème persiste, revenez à la liste À traiter et signalez l’identifiant d’incident ci-dessous.',
    retryButton: 'Réessayer',
    reloadButton: 'Recharger la page',
    homeButton: 'Retour à la liste À traiter',
    routeLabel: 'Route',
    incidentLabel: 'Identifiant d’incident',
    copyButton: 'Copier les détails',
    copiedLabel: 'Copié',
  },
  en: {
    heading: 'Something went wrong on this page',
    description:
      'An unexpected error interrupted this page. Your data is safe. Try again, or reload the page; if the problem keeps happening, go back to the to-do list and report the incident id below.',
    retryButton: 'Try again',
    reloadButton: 'Reload the page',
    homeButton: 'Back to the to-do list',
    routeLabel: 'Route',
    incidentLabel: 'Incident id',
    copyButton: 'Copy the details',
    copiedLabel: 'Copied',
  },
} satisfies { fr: ErrorBoundaryStrings; en: ErrorBoundaryStrings };
