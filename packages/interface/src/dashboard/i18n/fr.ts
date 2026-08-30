import type { DashboardStrings } from './types';

export const fr: DashboardStrings = {
  nav: {
    audits: 'Audits',
    newScan: 'Nouveau scan',
  },
  shell: {
    tagline: 'Console opérateur',
    navigation: 'Navigation',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    language: 'Langue de l’interface',
  },
  page: {
    audits: {
      title: 'Audits',
      description: 'Historique des scans et accès aux rapports.',
      placeholder: 'La liste des audits arrive avec la prochaine tranche.',
    },
    newScan: {
      title: 'Nouveau scan',
      description: 'Lancer un audit complet ou une prospection sur un site.',
      placeholder: 'Le formulaire arrive avec la prochaine tranche.',
    },
    scanProgress: {
      title: 'Suivi du scan',
      description: 'Phases de crawl et d’analyse, résultats par URL.',
      placeholder: 'Le suivi en direct arrive avec la prochaine tranche.',
    },
    auditDetail: {
      title: 'Détail de l’audit',
      description: 'Constats, enrichissement et rapports.',
      placeholder: 'Le détail arrive avec la prochaine tranche.',
    },
  },
};
