export interface SuppressionsStrings {
  title: string;
  description: string;
  addressLabel: string;
  addressPlaceholder: string;
  checkButton: string;
  clearButton: string;
  resultSuppressed: string;
  resultNotSuppressed: string;
  hashNote: string;
}

export const suppressions = {
  fr: {
    title: 'Liste à ne pas contacter',
    description: 'Vérifier une adresse dans la liste à ne pas contacter.',
    addressLabel: 'Adresse e-mail',
    addressPlaceholder: 'nom@exemple.com',
    checkButton: 'Vérifier',
    clearButton: 'Effacer',
    resultSuppressed: 'Cette adresse est sur la liste à ne pas contacter.',
    resultNotSuppressed: 'Cette adresse n’est pas sur la liste à ne pas contacter.',
    hashNote:
      'L’adresse est vérifiée sans être conservée. La liste ne garde que des codes illisibles, jamais les adresses.',
  },
  en: {
    title: 'Do-not-contact list',
    description: 'Check one address against the do-not-contact list.',
    addressLabel: 'Email address',
    addressPlaceholder: 'name@example.com',
    checkButton: 'Check',
    clearButton: 'Clear',
    resultSuppressed: 'This address is on the do-not-contact list.',
    resultNotSuppressed: 'This address is not on the do-not-contact list.',
    hashNote:
      'The address is checked without being stored. The list only keeps unreadable codes, never the addresses themselves.',
  },
} satisfies { fr: SuppressionsStrings; en: SuppressionsStrings };
