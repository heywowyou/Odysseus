export interface ShellStrings {
  tagline: string;
  /** Sidebar group headings. The navigation is grouped by the two halves of
   *  the work rather than listed flat. */
  groupMeasure: string;
  groupCampaign: string;
  navigation: string;
  openMenu: string;
  closeMenu: string;
  language: string;
  /** Footer link to the do-not-contact lookup (/ne-pas-contacter). */
  checkAddress: string;
  /** Footer build-revision disclosure (issue: expose build/revision
   *  metadata) - "which build handled this?" without opening devtools. */
  buildRevisionLabel: string;
  copyBuildRevision: string;
  buildRevisionCopied: string;
}

export const shell = {
  fr: {
    tagline: 'Tableau de bord opérateur',
    groupMeasure: 'Mesure',
    groupCampaign: 'Campagne',
    navigation: 'Navigation',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    checkAddress: 'Vérifier une adresse',
    language: 'Langue de l’interface',
    buildRevisionLabel: 'Version',
    copyBuildRevision: 'Copier la version',
    buildRevisionCopied: 'Copié',
  },
  en: {
    tagline: 'Operator dashboard',
    groupMeasure: 'Measurement',
    groupCampaign: 'Campaign',
    navigation: 'Navigation',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    checkAddress: 'Check an address',
    language: 'Interface language',
    buildRevisionLabel: 'Build',
    copyBuildRevision: 'Copy build revision',
    buildRevisionCopied: 'Copied',
  },
} satisfies { fr: ShellStrings; en: ShellStrings };
