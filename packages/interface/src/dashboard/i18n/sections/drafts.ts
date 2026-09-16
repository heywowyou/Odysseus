export interface DraftsStrings {
  approve: string;
  skip: string;
  neverSendNote: string;
  /** Issue #15: read-only dialog with the draft's persisted text. */
  viewText: string;
  textDialogDescription: string;
  textSubjectLabel: string;
  textBodyLabel: string;
  copyButton: string;
  copiedLabel: string;
}

export const drafts = {
  fr: {
    approve: 'Marquer revu',
    skip: 'Passer',
    neverSendNote:
      'Odysseus ne peut pas envoyer de brouillons. L’envoi se fait uniquement depuis la boîte de l’opérateur.',
    viewText: 'Voir le texte',
    textDialogDescription:
      'Le texte exact stocké avec ce brouillon. L’envoi se fait uniquement depuis votre boîte.',
    textSubjectLabel: 'Objet',
    textBodyLabel: 'Corps du message',
    copyButton: 'Copier',
    copiedLabel: 'Copié',
  },
  en: {
    approve: 'Mark reviewed',
    skip: 'Skip',
    neverSendNote: 'Odysseus cannot send drafts. Sending happens only in the operator mailbox.',
    viewText: 'View text',
    textDialogDescription:
      'The exact text stored with this draft. Sending happens only in your mailbox.',
    textSubjectLabel: 'Subject',
    textBodyLabel: 'Message body',
    copyButton: 'Copy',
    copiedLabel: 'Copied',
  },
} satisfies { fr: DraftsStrings; en: DraftsStrings };
