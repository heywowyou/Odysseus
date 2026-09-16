export interface ToolsStrings {
  navLabel: string;
  title: string;
  description: string;
}

export const tools = {
  fr: {
    navLabel: 'Outils',
    title: 'Outils',
    description:
      'Suivis externes conservés hors du tableau de bord. Chaque lien ouvre une page privée.',
  },
  en: {
    navLabel: 'Tools',
    title: 'Tools',
    description: 'External trackers kept outside the dashboard. Each link opens a private page.',
  },
} satisfies { fr: ToolsStrings; en: ToolsStrings };
