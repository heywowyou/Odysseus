export interface ProspectDetailStrings {
  description: string;
  /** Section labels the hub's Fiche section still renders; the other
   *  stage names live in hub.steps. */
  sections: Record<'identity' | 'qualification', string>;
  openSite: string;
  outreachScanQueued: string;
  outreachScanRefused: string;
  quickCheckQueued: string;
  quickCheckRefused: string;
  sourcesHeading: string;
  sources: {
    field: string;
    value: string;
    source: string;
    /** Empty state of the sources list, plain about sources (the old
     *  copy reused the outcome-empty sentence). */
    none: string;
  };
  qualification: { outcome: string; reason: string; events: string };
  /** Contact section rows (issue #95): operator labels for the store's
   *  contact evaluation fields. A field with no value is omitted rather
   *  than rendered as an empty labelled row. */
  contact: {
    decision: string;
    reason: string;
    mailbox: string;
    source: string;
    validatedAt: string;
  };
  thread: { lastEventAt: string };
  outcomeNone: string;
  catalogue: {
    name: string;
    city: string;
    ownDomain: string;
    groupId: string;
  };
}

export const prospectDetail = {
  fr: {
    description: 'Revue de la source jusqu’au résultat pour ce prospect.',
    sections: {
      identity: 'Identité',
      qualification: 'Qualification',
    },
    openSite: 'Ouvrir le site dans un nouvel onglet',
    outreachScanQueued: 'Audit de prospection en file d’attente.',
    outreachScanRefused: 'L’analyse n’a pas pu être lancée.',
    quickCheckQueued: 'La vérification rapide est en file d’attente.',
    quickCheckRefused: 'La vérification rapide n’a pas pu être lancée.',
    sourcesHeading: 'Sources',
    sources: {
      field: 'Champ',
      value: 'Valeur',
      source: 'Source',
      none: 'Aucune source enregistrée pour cet hôtel.',
    },
    qualification: { outcome: 'Décision', reason: 'Motif', events: 'Événements de qualification' },
    contact: {
      decision: 'Décision',
      reason: 'Motif',
      mailbox: 'Boîte aux lettres',
      source: 'Source',
      validatedAt: 'Validé le',
    },
    thread: { lastEventAt: 'Dernier événement' },
    outcomeNone: 'Aucun résultat défini.',
    catalogue: {
      name: 'Nom',
      city: 'Ville',
      ownDomain: 'Adresse web propre',
      groupId: 'Groupe',
    },
  },
  en: {
    description: 'Source-to-outcome review for this prospect.',
    sections: {
      identity: 'Identity',
      qualification: 'Qualification',
    },
    openSite: 'Open the site in a new tab',
    outreachScanQueued: 'The prospecting audit is queued.',
    outreachScanRefused: 'The scan could not be started.',
    quickCheckQueued: 'The quick check is queued.',
    quickCheckRefused: 'The quick check could not be started.',
    sourcesHeading: 'Sources',
    sources: {
      field: 'Field',
      value: 'Value',
      source: 'Source',
      none: 'No sources recorded for this hotel.',
    },
    qualification: { outcome: 'Decision', reason: 'Reason', events: 'Qualification events' },
    contact: {
      decision: 'Decision',
      reason: 'Reason',
      mailbox: 'Mailbox',
      source: 'Source',
      validatedAt: 'Validated at',
    },
    thread: { lastEventAt: 'Last event' },
    outcomeNone: 'No outcome set.',
    catalogue: {
      name: 'Name',
      city: 'City',
      ownDomain: 'Own web address',
      groupId: 'Group',
    },
  },
} satisfies { fr: ProspectDetailStrings; en: ProspectDetailStrings };
