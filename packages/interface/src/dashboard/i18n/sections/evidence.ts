export interface EvidenceStrings {
  title: string;
  assetNames: { homepage: string; contact: string };
  /** Issue #92: shown in place of a screenshot whose bytes cannot be
   *  resolved from this machine (swept artifacts, or the quick check ran
   *  elsewhere). */
  unavailable: string;
}

export const evidence = {
  fr: {
    title: 'Preuves',
    assetNames: { homepage: 'Preuve page d’accueil', contact: 'Preuve page contact' },
    unavailable:
      'Cette capture n’a pas pu être chargée. Le fichier a peut-être été supprimé après l’expiration de son contrôle rapide, ou le contrôle a tourné sur une autre machine.',
  },
  en: {
    title: 'Evidence',
    assetNames: { homepage: 'Homepage proof', contact: 'Contact page proof' },
    unavailable:
      'This screenshot could not be loaded. The file may have been removed after its quick check expired, or the check ran on another machine.',
  },
} satisfies { fr: EvidenceStrings; en: EvidenceStrings };
