/**
 * Per-route title and description used when the in-page language toggle
 * changes the active language without changing the URL.
 */
export const PAGE_META: Record<
  string,
  { fr: { title: string; description: string }; en: { title: string; description: string } }
> = {
  '/': {
    fr: {
      title: 'Odysseus, diagnostic technique de site web',
      description:
        'Diagnostic technique de site web : accessibilité, référencement naturel, rendu JavaScript, performance et signaux techniques liés aux assistants IA. Rapport priorisé, tarif fixe de 1 600 € HT.',
    },
    en: {
      title: 'Odysseus, technical website diagnostic',
      description:
        'Technical website diagnostic covering accessibility, search, JavaScript rendering, performance and technical signals for AI assistants. Prioritised report, fixed price of EUR 1,600 excl. VAT.',
    },
  },
  '/offre': {
    fr: {
      title: 'Le diagnostic technique Odysseus | Odysseus',
      description:
        'Les contrôles réalisés, le contenu du rapport, le délai et le tarif fixe de 1 600 € HT du diagnostic technique Odysseus.',
    },
    en: {
      title: 'The Odysseus technical diagnostic | Odysseus',
      description:
        'The checks performed, report contents, delivery process and fixed EUR 1,600 excl. VAT price of the Odysseus technical diagnostic.',
    },
  },
  '/bot': {
    fr: {
      title: 'OdysseusBot | Odysseus',
      description:
        "Ce que fait OdysseusBot lorsqu'il visite un site : pages consultées, rythme des requêtes, données conservées et moyens de le bloquer.",
    },
    en: {
      title: 'OdysseusBot | Odysseus',
      description:
        'What OdysseusBot does when it visits a website: pages accessed, request pacing, retained data, and how to block it.',
    },
  },
  '/confidentialite-prospection': {
    fr: {
      title: 'Prospection et données personnelles | Odysseus',
      description:
        "Quelles données Odysseus utilise pour sa prospection, d'où elles proviennent, combien de temps elles sont conservées et comment s'y opposer.",
    },
    en: {
      title: 'Outreach and personal data | Odysseus',
      description:
        'What data Odysseus uses for outreach, where it comes from, how long it is kept, and how to opt out.',
    },
  },
  '/desinscription': {
    fr: {
      title: 'Ne plus être contacté | Odysseus',
      description:
        'Comment demander à ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.',
    },
    en: {
      title: 'Opt out of future contact | Odysseus',
      description:
        'How to opt out of future contact from Odysseus and have an online preview removed.',
    },
  },
};
