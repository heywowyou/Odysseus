export interface NewScanStrings {
  title: string;
  description: string;
  typeLabel: string;
  typeFullAudit: string;
  typeQuickCheck: string;
  typeFullAuditHint: string;
  typeQuickCheckHint: string;
  urlLabel: string;
  urlPlaceholder: string;
  /** Issue #403: `{url}` is the completed address of a bare domain. */
  urlNormalizedHint: string;
  prospectLabel: string;
  noProspectOption: string;
  prospectMatchHint: string;
  prospectSearchPlaceholder: string;
  prospectSearchAria: string;
  prospectSearchEmpty: string;
  createProspectAction: string;
  createProspectTitle: string;
  createProspectNamePlaceholder: string;
  createProspectNameAria: string;
  createProspectSubmit: string;
  prospectCreated: string;
  /** Shown when a non-empty URL is not an absolute http(s) URL without
   *  embedded credentials, the shape routes/scans.ts accepts. */
  urlInvalidError: string;
  /** Full-audit only (single-audit input, no bulk equivalent for
   *  prospecting yet). Optional: used for the obligation determination
   *  when the site itself does not publish a SIREN, or to cross-check
   *  one that does. Never suppresses the site's own LCEN finding. */
  sirenLabel: string;
  sirenPlaceholder: string;
  sirenHint: string;
  sirenInvalidError: string;
  /** Part B of the transactional-flow milestone: a manual escape hatch
   *  for whatever the behavioral detector still misses. Absent (the
   *  "let the tool detect" option) falls through to detection entirely;
   *  the reason field is only shown once yes/no is picked. */
  transactionalFlowLabel: string;
  transactionalFlowAutoOption: string;
  transactionalFlowYesOption: string;
  transactionalFlowNoOption: string;
  transactionalFlowReasonLabel: string;
  transactionalFlowReasonPlaceholder: string;
  advancedOptions: string;
  maxPagesLabel: string;
  /** Stands under the max-pages input: empty means the whole site, which
   *  can take hours on a large site. */
  maxPagesHint: string;
  maxDepthLabel: string;
  delayLabel: string;
  /** Stands under the delay input: the server raises values below its
   *  configured default up to it, so the option only slows the crawl. */
  delayHint: string;
  scanConcurrencyLabel: string;
  /** Stands under the scan-concurrency input: the server lowers values
   *  above its configured default down to it, so the option only reduces
   *  the load on the scanned site. The default itself is not shown here;
   *  the operator reads it from the server env config. */
  scanConcurrencyHint: string;
  seedsLabel: string;
  seedsPlaceholder: string;
  exclusionsLabel: string;
  exclusionsPlaceholder: string;
  bookingEngineUrlLabel: string;
  bookingEngineUrlPlaceholder: string;
  submitButton: string;
  submitError: string;
}

export const newScan = {
  fr: {
    title: 'Nouveau scan',
    description: 'Lancer un contrôle rapide ou un scan complet.',
    typeLabel: 'Type de scan',
    typeFullAudit: 'Scan complet',
    typeQuickCheck: 'Contrôle rapide',
    typeFullAuditHint:
      'Explore tout le site une seule fois. Ce scan sert ensuite à la prospection, au rapport français et, si demandé, à sa version anglaise, sans nouvelle exploration.',
    typeQuickCheckHint: 'Contrôle informatif d’une page, sans analyse ni rapport client.',
    urlLabel: 'Adresse du site',
    urlPlaceholder: 'https://exemple.fr',
    urlNormalizedHint: 'Adresse analysée : {url}',
    prospectLabel: 'Rattacher à un prospect (facultatif)',
    noProspectOption: 'Ne pas rattacher',
    prospectMatchHint: 'Le domaine est proposé automatiquement quand un prospect correspond.',
    prospectSearchPlaceholder: 'Rechercher un prospect existant',
    prospectSearchAria: 'Rechercher un prospect existant',
    prospectSearchEmpty: 'Aucun prospect ne correspond à cette recherche.',
    createProspectAction: 'Créer un prospect',
    createProspectTitle: 'Créer un prospect à rattacher',
    createProspectNamePlaceholder: 'Nom du prospect',
    createProspectNameAria: 'Nom du nouveau prospect',
    createProspectSubmit: 'Créer et rattacher',
    prospectCreated: 'Prospect créé et rattaché au scan.',
    urlInvalidError:
      'Saisissez une adresse complète commençant par https://, sans nom d’utilisateur ni mot de passe.',
    sirenLabel: 'SIREN (numéro d’entreprise, facultatif)',
    sirenPlaceholder: '123 456 789',
    sirenHint:
      'À renseigner si vous connaissez déjà le SIREN de l’entreprise auditée. N’efface jamais le constat si le site ne publie pas le sien.',
    sirenInvalidError: 'Ce SIREN n’est pas valide (il échoue au contrôle officiel de l’INSEE).',
    transactionalFlowLabel:
      'Ce site prend-il les réservations ou vend-il en ligne en direct (pas via une plateforme) ?',
    transactionalFlowAutoOption: 'Laisser l’outil détecter',
    transactionalFlowYesOption: 'Oui',
    transactionalFlowNoOption: 'Non',
    transactionalFlowReasonLabel: 'Raison (facultatif)',
    transactionalFlowReasonPlaceholder:
      'Ex. redirige vers un moteur de réservation dédié, confirmé manuellement',
    advancedOptions: 'Options avancées',
    maxPagesLabel: 'Nombre maximum de pages',
    maxPagesHint:
      'Laisser vide signifie que tout le site est exploré : un grand site peut demander plusieurs heures. Pour un essai rapide, fixez une limite de pages.',
    maxDepthLabel: 'Nombre de clics depuis la page d’accueil à suivre',
    delayLabel: 'Pause entre deux pages chargées (secondes)',
    delayHint:
      'En secondes : 60 correspond à une minute. Laisser vide pour la valeur par défaut. Une valeur inférieure à la valeur par défaut est relevée jusqu’à elle : cette option ne peut donc que ralentir l’exploration.',
    scanConcurrencyLabel: 'Pages analysées en même temps',
    scanConcurrencyHint:
      'Laisser vide pour la valeur par défaut. Une valeur supérieure à la valeur par défaut est abaissée jusqu’à elle : cette option ne peut donc que réduire la charge sur le site. Utile pour les sites qui refusent les rafales de requêtes.',
    seedsLabel: 'Pages de départ supplémentaires à inclure (une par ligne)',
    seedsPlaceholder: 'https://exemple.fr/page-non-liee',
    exclusionsLabel: 'Adresses à ignorer (utilisez * comme joker, une par ligne)',
    exclusionsPlaceholder: 'https://exemple.fr/blog/*',
    bookingEngineUrlLabel: 'URL du moteur de réservation connu (optionnel)',
    bookingEngineUrlPlaceholder: 'https://booking.prestataire.fr/hotel-x',
    submitButton: 'Lancer le scan',
    submitError: 'Impossible de lancer l’analyse',
  },
  en: {
    title: 'New scan',
    description: 'Run a quick check or a full scan.',
    typeLabel: 'Scan type',
    typeFullAudit: 'Full scan',
    typeQuickCheck: 'Quick check',
    typeFullAuditHint:
      'Crawls the whole site once. The scan then serves outreach, the French report and, when requested, its English version without crawling again.',
    typeQuickCheckHint: 'A one-page informational check with no analysis or client report.',
    urlLabel: 'Site URL',
    urlPlaceholder: 'https://example.co.uk',
    urlNormalizedHint: 'Address to scan: {url}',
    prospectLabel: 'Attach to a prospect (optional)',
    noProspectOption: 'Do not attach',
    prospectMatchHint: 'A matching prospect is suggested automatically for this domain.',
    prospectSearchPlaceholder: 'Search existing prospects',
    prospectSearchAria: 'Search existing prospects',
    prospectSearchEmpty: 'No prospect matches this search.',
    createProspectAction: 'Create a prospect',
    createProspectTitle: 'Create a prospect to attach',
    createProspectNamePlaceholder: 'Prospect name',
    createProspectNameAria: 'New prospect name',
    createProspectSubmit: 'Create and attach',
    prospectCreated: 'Prospect created and attached to the scan.',
    urlInvalidError:
      'Enter a full web address starting with https://, with no username or password in it.',
    sirenLabel: 'SIREN (French company number, optional)',
    sirenPlaceholder: '123 456 789',
    sirenHint:
      'Fill this in if you already know the audited company’s SIREN. It never erases the finding when the site does not publish its own.',
    sirenInvalidError: 'This SIREN number is not valid (it fails the official INSEE check).',
    transactionalFlowLabel:
      'Does this site take bookings or sell online directly (not through a booking platform)?',
    transactionalFlowAutoOption: 'Let the tool detect',
    transactionalFlowYesOption: 'Yes',
    transactionalFlowNoOption: 'No',
    transactionalFlowReasonLabel: 'Reason (optional)',
    transactionalFlowReasonPlaceholder:
      'E.g. redirects to a dedicated booking engine, confirmed manually',
    advancedOptions: 'Advanced options',
    maxPagesLabel: 'Maximum pages',
    maxPagesHint:
      'Leave empty to explore the whole site: a large site can take several hours. For a quick trial, set a page limit.',
    maxDepthLabel: 'How many clicks from the home page to follow',
    delayLabel: 'Pause between page loads (seconds)',
    delayHint:
      'In seconds: 60 is one minute. Leave empty for the default. Values below the default are raised to it, so this can only slow the crawl down.',
    scanConcurrencyLabel: 'Pages scanned at once',
    scanConcurrencyHint:
      'Leave empty for the default. Values above the default are lowered to it, so this can only reduce the load on the site. Useful for sites that reject bursts of requests.',
    seedsLabel: 'Extra starting pages to include (one per line)',
    seedsPlaceholder: 'https://example.co.uk/unlinked-page',
    exclusionsLabel: 'Addresses to skip (use * as a wildcard, one per line)',
    exclusionsPlaceholder: 'https://example.co.uk/blog/*',
    bookingEngineUrlLabel: 'Known booking engine URL (optional)',
    bookingEngineUrlPlaceholder: 'https://booking.vendor.example/hotel-x',
    submitButton: 'Start scan',
    submitError: 'The scan could not be started',
  },
} satisfies { fr: NewScanStrings; en: NewScanStrings };
