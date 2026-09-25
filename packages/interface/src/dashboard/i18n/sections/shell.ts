export interface ShellStrings {
  tagline: string;
  /** Sidebar group headings. The navigation is grouped by the two halves of
   *  the work rather than listed flat. */
  groupMeasure: string;
  groupCampaign: string;
  navigation: string;
  /** Accessible name of the sidebar landmark, which holds more than the
   *  navigation (the reference audit and the tools link). */
  sidebar: string;
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
  referenceAuditLabel: string;
  referenceAuditStates: Record<'current' | 'stale' | 'missing', string>;
}

export const shell = {
  fr: {
    tagline: 'Tableau de bord opérateur',
    groupMeasure: 'Mesure',
    groupCampaign: 'Campagne',
    navigation: 'Navigation',
    sidebar: 'Barre latérale',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
    checkAddress: 'Vérifier une adresse',
    language: 'Langue de l’interface',
    buildRevisionLabel: 'Version',
    copyBuildRevision: 'Copier la version',
    buildRevisionCopied: 'Copié',
    referenceAuditLabel: 'Exemple d’audit',
    referenceAuditStates: { current: 'à jour', stale: 'à régénérer', missing: 'indisponible' },
  },
  en: {
    tagline: 'Operator dashboard',
    groupMeasure: 'Measurement',
    groupCampaign: 'Campaign',
    navigation: 'Navigation',
    sidebar: 'Sidebar',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    checkAddress: 'Check an address',
    language: 'Interface language',
    buildRevisionLabel: 'Build',
    copyBuildRevision: 'Copy build revision',
    buildRevisionCopied: 'Copied',
    referenceAuditLabel: 'Reference audit',
    referenceAuditStates: { current: 'current', stale: 'needs refresh', missing: 'unavailable' },
  },
} satisfies { fr: ShellStrings; en: ShellStrings };
