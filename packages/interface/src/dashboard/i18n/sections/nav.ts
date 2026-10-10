export interface NavStrings {
  audits: string;
  newScan: string;
  prospects: string;
  /** Sidebar label for /a-traiter, the landing page (plan 040 slice 6;
   *  operator decision 2026-09-12: "Démarches" becomes "À traiter"). */
  outreach: string;
  /** Sidebar label for /campagne, and that page's title. */
  campaign: string;
}

export const nav = {
  fr: {
    audits: 'Audits',
    newScan: 'Nouveau scan',
    prospects: 'Prospects',
    outreach: 'À traiter',
    campaign: 'Résultats de campagne',
  },
  en: {
    audits: 'Audits',
    newScan: 'New scan',
    prospects: 'Prospects',
    outreach: 'To do',
    campaign: 'Campaign results',
  },
} satisfies { fr: NavStrings; en: NavStrings };
