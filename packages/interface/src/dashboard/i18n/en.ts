import type { DashboardStrings } from './types';

export const en: DashboardStrings = {
  nav: {
    audits: 'Audits',
    newScan: 'New scan',
  },
  shell: {
    tagline: 'Operator console',
    navigation: 'Navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    language: 'Interface language',
  },
  page: {
    audits: {
      title: 'Audits',
      description: 'Scan history and access to reports.',
      placeholder: 'The audit list arrives with the next slice.',
    },
    newScan: {
      title: 'New scan',
      description: 'Start a full audit or a prospection on a site.',
      placeholder: 'The form arrives with the next slice.',
    },
    scanProgress: {
      title: 'Scan progress',
      description: 'Crawl and analysis phases, per-URL results.',
      placeholder: 'Live tracking arrives with the next slice.',
    },
    auditDetail: {
      title: 'Audit detail',
      description: 'Findings, enrichment, and reports.',
      placeholder: 'The detail arrives with the next slice.',
    },
  },
};
