export interface PrescanStrings {
  statusLabel: string;
  scannedAtLabel: string;
  columns: { role: string; status: string };
  roleLabels: Record<'homepage' | 'booking' | 'content', string>;
}

export const prescan = {
  fr: {
    statusLabel: 'Statut',
    scannedAtLabel: 'Vérifié le',
    columns: { role: 'Type de page', status: 'Statut' },
    roleLabels: { homepage: 'Accueil', booking: 'Réservation', content: 'Contenu' },
  },
  en: {
    statusLabel: 'Status',
    scannedAtLabel: 'Checked at',
    columns: { role: 'Page type', status: 'Status' },
    roleLabels: { homepage: 'Home', booking: 'Booking', content: 'Content' },
  },
} satisfies { fr: PrescanStrings; en: PrescanStrings };
