export interface NavStrings {
  audits: string;
  newScan: string;
  prospects: string;
  /** Sidebar label for /a-traiter, the landing page (plan 040 slice 6;
   *  operator decision 2026-09-12: "Démarches" becomes "À traiter"). */
  outreach: string;
}

export const nav = {
  fr: {
    audits: 'Audits',
    newScan: 'Nouveau scan',
    prospects: 'Prospects',
    outreach: 'À traiter',
  },
  en: {
    audits: 'Audits',
    newScan: 'New scan',
    prospects: 'Prospects',
    outreach: 'To do',
  },
} satisfies { fr: NavStrings; en: NavStrings };
