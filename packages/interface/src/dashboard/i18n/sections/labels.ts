export interface LabelsStrings {
  identity: Record<'resolved' | 'needs-review' | 'ambiguous' | 'unmatched', string>;
  group: Record<'independent' | 'group-member' | 'vendor-hosted' | 'unknown', string>;
  review: Record<'not-required' | 'pending' | 'accepted' | 'rejected', string>;
  qualification: Record<
    'qualified' | 'parked' | 'rejected' | 'already-engaged' | 'group-routed' | 'not-evaluated',
    string
  >;
  contact: Record<'found' | 'parked' | 'rejected' | 'suppressed', string>;
  /** Why a contact evaluation concluded what it did: core's closed
   *  HotelContactReason vocabulary. A newer store value falls back to the
   *  raw code, like every other map here. */
  contactReason: Record<string, string>;
  /** Whether the address's domain publishes mail exchangers. `unknown` is a
   *  real outcome and its copy must not read as a failure of the hotel. */
  mailDomain: Record<'has-mx' | 'no-mx' | 'unknown', string>;
  /** Where a usable address was found; closed core ContactSourceKind. */
  contactSource: Record<'homepage' | 'mentions-legales' | 'contact-page', string>;
  thread: Record<
    | 'open'
    | 'e1-drafted'
    | 'e1-sent'
    | 'e2-drafted'
    | 'e2-sent'
    | 'e3-drafted'
    | 'e3-sent'
    | 'replied'
    | 'bounced'
    | 'opted-out'
    | 'sequence-complete'
    | 'closed',
    string
  >;
  outcome: Record<
    | 'no-reply'
    | 'reply-positive'
    | 'reply-not-now'
    | 'reply-negative'
    | 'opt-out'
    | 'call'
    | 'quoted'
    | 'won'
    | 'lost',
    string
  >;
  lostReason: Record<
    'budget' | 'timing' | 'not-a-priority' | 'existing-provider' | 'scope-mismatch' | 'other',
    string
  >;
  /** The two halves of a prospect score, named where they are shown. The
   *  store's own field names (`brokenness`, `ability`) used to reach the
   *  operator untranslated in the version-difference table. */
  scoreSide: Record<'brokenness' | 'ability', string>;
  /** Why a score component scored what it did: core's closed
   *  HotelScoreReason vocabulary. Every `*-unknown` value means the fact was
   *  never observed, which is deliberately not the same as observing it
   *  absent, and the copy has to keep those apart. */
  scoreReason: Record<string, string>;
}

export const labels = {
  fr: {
    identity: {
      resolved: 'Rapproché',
      'needs-review': 'À valider',
      ambiguous: 'Ambigu',
      unmatched: 'Sans correspondance',
    },
    group: {
      independent: 'Indépendant',
      'group-member': 'Membre de groupe',
      'vendor-hosted': 'Hébergé par un prestataire',
      unknown: 'Inconnu',
    },
    review: {
      'not-required': 'Non requise',
      pending: 'En attente',
      accepted: 'Accepté',
      rejected: 'Rejeté',
    },
    qualification: {
      qualified: 'Qualifié',
      parked: 'Mis de côté',
      rejected: 'Rejeté',
      'already-engaged': 'Déjà démarché',
      'group-routed': 'Géré par le groupe',
      'not-evaluated': 'Pas encore évalué',
    },
    contact: {
      found: 'Trouvé',
      parked: 'Mis de côté',
      rejected: 'Inutilisable',
      suppressed: 'À ne pas contacter',
    },
    contactReason: {
      'role-address-published': 'Une adresse de rôle est publiée',
      'no-address-published': 'Aucune adresse n’est publiée',
      'site-unreachable': 'Le site n’a pas pu être joint',
      'robots-denied': 'La visite a été refusée par robots.txt',
      'no-mail-service': 'Une adresse a été trouvée, mais son domaine n’a pas de service de mail',
      'named-local-parts-only': 'Seules des boîtes nominatives sont publiées',
      'free-mail-only': 'Seule une adresse de messagerie gratuite est publiée',
      'off-domain-only': 'Seules des adresses hors du domaine de l’hôtel sont publiées',
      'domain-suppressed': 'Le domaine est à ne pas contacter',
      'address-suppressed': 'L’adresse est à ne pas contacter',
    },
    mailDomain: {
      'has-mx': 'Le domaine accepte les emails',
      'no-mx': 'Le domaine n’accepte aucun email',
      unknown: 'Le domaine n’a pas pu être vérifié',
    },
    contactSource: {
      homepage: 'Page d’accueil',
      'mentions-legales': 'Mentions légales',
      'contact-page': 'Page contact',
    },
    thread: {
      open: 'Ouvert',
      'e1-drafted': 'Premier email en brouillon',
      'e1-sent': 'Premier email envoyé',
      'e2-drafted': 'Relance 1 en brouillon',
      'e2-sent': 'Relance 1 envoyée',
      'e3-drafted': 'Relance 2 en brouillon',
      'e3-sent': 'Relance 2 envoyée',
      replied: 'Réponse reçue',
      bounced: 'Échec de livraison',
      'opted-out': 'Retiré',
      'sequence-complete': 'Toutes les relances envoyées',
      closed: 'Fermé',
    },
    outcome: {
      'no-reply': 'Sans réponse',
      'reply-positive': 'Réponse positive',
      'reply-not-now': 'Pas maintenant',
      'reply-negative': 'Réponse négative',
      'opt-out': 'Retrait',
      call: 'Appel',
      quoted: 'Devis envoyé',
      won: 'Gagné',
      lost: 'Perdu',
    },
    lostReason: {
      budget: 'Budget',
      timing: 'Moment',
      'not-a-priority': 'Pas une priorité',
      'existing-provider': 'Fournisseur existant',
      'scope-mismatch': 'Hors périmètre',
      other: 'Autre',
    },
    scoreSide: {
      brokenness: 'Problèmes constatés',
      ability: 'Capacité à corriger',
    },
    scoreReason: {
      'render-gap-severe': 'Plus de la moitié du texte n’apparaît qu’après exécution du script',
      'render-gap-material': 'Une part notable du texte n’apparaît qu’après exécution du script',
      'render-gap-below-threshold': 'Le texte s’affiche sans attendre le script',
      'render-gap-unknown': 'Écart de rendu non observé',
      'booking-page-failure-captured': 'Défaut relevé sur la page de réservation',
      'generic-failure-captured': 'Défaut relevé sur une autre page',
      'no-failure-captured': 'Aucun défaut illustrable relevé',
      'axe-critical-many': 'Plusieurs défauts critiques d’accessibilité',
      'axe-critical-present': 'Au moins un défaut critique d’accessibilité',
      'axe-critical-none': 'Aucun défaut critique d’accessibilité',
      'axe-serious-many': 'Nombreux défauts sérieux d’accessibilité',
      'axe-serious-several': 'Plusieurs défauts sérieux d’accessibilité',
      'axe-serious-present': 'Au moins un défaut sérieux d’accessibilité',
      'axe-serious-none': 'Aucun défaut sérieux d’accessibilité',
      'axe-unknown': 'Accessibilité non contrôlée',
      'console-errors-many': 'Nombreuses erreurs de script',
      'console-errors-present': 'Erreurs de script relevées',
      'console-errors-none': 'Aucune erreur de script',
      'console-errors-unknown': 'Erreurs de script non observées',
      'metrics-poor': 'Performances mesurées faibles',
      'metrics-acceptable': 'Performances mesurées correctes',
      'metrics-unobserved': 'Performances non mesurées',
      'direct-booking-on-own-domain': 'Réservation directe sur son propre domaine',
      'booking-offsite-only': 'Réservation uniquement sur une plateforme externe',
      'booking-path-undetected': 'Aucun parcours de réservation détecté',
      'star-rating-four-or-five': 'Quatre ou cinq étoiles',
      'star-rating-three': 'Trois étoiles',
      'star-rating-unknown': 'Nombre d’étoiles inconnu',
      'capacity-meaningful': 'Capacité d’accueil significative',
      'capacity-small': 'Petite capacité d’accueil',
      'capacity-unknown': 'Capacité d’accueil inconnue',
      'effectif-ten-or-more': 'Dix salariés ou plus',
      'effectif-under-ten-or-unmatched': 'Moins de dix salariés, ou effectif inconnu',
      independent: 'Établissement indépendant',
      'not-independent': 'Rattaché à un groupe ou hébergé par un prestataire',
    },
  },
  en: {
    identity: {
      resolved: 'Matched',
      'needs-review': 'Needs review',
      ambiguous: 'Ambiguous',
      unmatched: 'No match',
    },
    group: {
      independent: 'Independent',
      'group-member': 'Group member',
      'vendor-hosted': 'Vendor hosted',
      unknown: 'Unknown',
    },
    review: {
      'not-required': 'Not required',
      pending: 'Pending',
      accepted: 'Accepted',
      rejected: 'Rejected',
    },
    qualification: {
      qualified: 'Qualified',
      parked: 'On hold',
      rejected: 'Rejected',
      'already-engaged': 'Already engaged',
      'group-routed': 'Handled by the group',
      'not-evaluated': 'Not evaluated yet',
    },
    contact: {
      found: 'Found',
      parked: 'On hold',
      rejected: 'Unusable',
      suppressed: 'On the do-not-contact list',
    },
    contactReason: {
      'role-address-published': 'A role address is published',
      'no-address-published': 'No address is published',
      'site-unreachable': 'The site could not be reached',
      'robots-denied': 'The visit was refused by robots.txt',
      'no-mail-service': 'An address was found, but its domain has no mail service',
      'named-local-parts-only': 'Only named mailboxes are published',
      'free-mail-only': 'Only a free-mail address is published',
      'off-domain-only': 'Only addresses outside the hotel domain are published',
      'domain-suppressed': 'The domain is on the do-not-contact list',
      'address-suppressed': 'The address is on the do-not-contact list',
    },
    mailDomain: {
      'has-mx': 'The domain accepts email',
      'no-mx': 'The domain accepts no email',
      unknown: 'The domain could not be checked',
    },
    contactSource: {
      homepage: 'Homepage',
      'mentions-legales': 'Legal notice page',
      'contact-page': 'Contact page',
    },
    thread: {
      open: 'Open',
      'e1-drafted': 'First email drafted',
      'e1-sent': 'First email sent',
      'e2-drafted': 'Follow-up 1 drafted',
      'e2-sent': 'Follow-up 1 sent',
      'e3-drafted': 'Follow-up 2 drafted',
      'e3-sent': 'Follow-up 2 sent',
      replied: 'Replied',
      bounced: 'Delivery failed',
      'opted-out': 'Opted out',
      'sequence-complete': 'All emails sent',
      closed: 'Closed',
    },
    outcome: {
      'no-reply': 'No reply',
      'reply-positive': 'Positive reply',
      'reply-not-now': 'Not now',
      'reply-negative': 'Negative reply',
      'opt-out': 'Opt-out',
      call: 'Call',
      quoted: 'Quoted',
      won: 'Won',
      lost: 'Lost',
    },
    lostReason: {
      budget: 'Budget',
      timing: 'Timing',
      'not-a-priority': 'Not a priority',
      'existing-provider': 'Existing provider',
      'scope-mismatch': 'Scope mismatch',
      other: 'Other',
    },
    scoreSide: {
      brokenness: 'Problems found',
      ability: 'Ability to fix',
    },
    scoreReason: {
      'render-gap-severe': 'More than half the text appears only after the script runs',
      'render-gap-material': 'A material share of the text appears only after the script runs',
      'render-gap-below-threshold': 'Text shows without waiting for the script',
      'render-gap-unknown': 'Render gap not observed',
      'booking-page-failure-captured': 'Fault found on the booking page',
      'generic-failure-captured': 'Fault found on another page',
      'no-failure-captured': 'No illustratable fault found',
      'axe-critical-many': 'Several critical accessibility faults',
      'axe-critical-present': 'At least one critical accessibility fault',
      'axe-critical-none': 'No critical accessibility fault',
      'axe-serious-many': 'Many serious accessibility faults',
      'axe-serious-several': 'Several serious accessibility faults',
      'axe-serious-present': 'At least one serious accessibility fault',
      'axe-serious-none': 'No serious accessibility fault',
      'axe-unknown': 'Accessibility not checked',
      'console-errors-many': 'Many script errors',
      'console-errors-present': 'Script errors found',
      'console-errors-none': 'No script errors',
      'console-errors-unknown': 'Script errors not observed',
      'metrics-poor': 'Measured performance is poor',
      'metrics-acceptable': 'Measured performance is acceptable',
      'metrics-unobserved': 'Performance not measured',
      'direct-booking-on-own-domain': 'Direct booking on its own domain',
      'booking-offsite-only': 'Booking only through an external platform',
      'booking-path-undetected': 'No booking path detected',
      'star-rating-four-or-five': 'Four or five stars',
      'star-rating-three': 'Three stars',
      'star-rating-unknown': 'Star rating unknown',
      'capacity-meaningful': 'Meaningful guest capacity',
      'capacity-small': 'Small guest capacity',
      'capacity-unknown': 'Guest capacity unknown',
      'effectif-ten-or-more': 'Ten employees or more',
      'effectif-under-ten-or-unmatched': 'Fewer than ten employees, or headcount unknown',
      independent: 'Independent establishment',
      'not-independent': 'Part of a group, or hosted by a vendor',
    },
  },
} satisfies { fr: LabelsStrings; en: LabelsStrings };
