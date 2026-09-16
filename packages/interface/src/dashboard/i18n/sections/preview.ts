export interface PreviewStrings {
  description: string;
  statusLabel: string;
  publishedLabel: string;
  expiresLabel: string;
  states: Record<'live' | 'revoked' | 'expired' | 'none', string>;
  revokeAction: string;
  publishBlockedNoAudit: string;
  reissueConfirmTitle: string;
  reissueConfirmBody: string;
  revokeConfirmTitle: string;
  revokeConfirmBody: string;
}

export const preview = {
  fr: {
    description: 'L’aperçu publié pour ce prospect.',
    statusLabel: 'Statut',
    publishedLabel: 'Publié le',
    expiresLabel: 'Expire le',
    states: { live: 'En ligne', revoked: 'Retiré', expired: 'Expiré', none: 'Aucun' },
    revokeAction: 'Retirer l’aperçu',
    publishBlockedNoAudit: "Aucun audit n'existe encore : lancez-en un depuis l'onglet Audit.",
    reissueConfirmTitle: 'Émettre un nouveau lien ?',
    reissueConfirmBody:
      'Un nouveau lien public sera créé et affiché une seule fois. Le lien précédent continue de fonctionner jusqu’à son expiration ou son retrait.',
    revokeConfirmTitle: 'Retirer cet aperçu ?',
    revokeConfirmBody:
      'Tous les liens publics de cet hôtel cessent de fonctionner immédiatement. C’est irréversible.',
  },
  en: {
    description: 'The published preview for this prospect.',
    statusLabel: 'Status',
    publishedLabel: 'Published at',
    expiresLabel: 'Expires at',
    states: { live: 'Live', revoked: 'Taken down', expired: 'Expired', none: 'None' },
    revokeAction: 'Take the preview down',
    publishBlockedNoAudit: 'No audit exists yet: run one from the Audit tab first.',
    reissueConfirmTitle: 'Issue a new link?',
    reissueConfirmBody:
      'A new public link will be created and shown only once. The previous link keeps working until it expires or is taken down.',
    revokeConfirmTitle: 'Take the preview down?',
    revokeConfirmBody:
      'Every public link for this hotel stops working immediately. This cannot be undone.',
  },
} satisfies { fr: PreviewStrings; en: PreviewStrings };
