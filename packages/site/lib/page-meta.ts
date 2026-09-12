/**
 * Per-route title and description, in both languages, added for issue #196.
 *
 * `app/*\/page.tsx` metadata exports are server-rendered and French only:
 * Next has no per-visitor language at request time, and the language toggle
 * is a same-URL client affordance. This map is what the toggle reads to
 * update `document.title` and the description meta tag in the browser once
 * a visitor switches to English, so the tab, a bookmark, or a share preview
 * taken after toggling no longer says one thing while the page shows
 * another. The French entries mirror the metadata already rendered on the
 * server; they exist here only so the effect has something to restore when
 * a visitor switches back.
 */
export const PAGE_META: Record<
  string,
  { fr: { title: string; description: string }; en: { title: string; description: string } }
> = {
  '/': {
    fr: {
      title: 'Odysseus, diagnostic technique de site web',
      description:
        'Diagnostic technique automatisé pour sites web : accessibilité, référencement naturel, signaux de visibilité IA et performance. Une liste de corrections classées par priorité, à un prix publié de 1 600 € HT.',
    },
    en: {
      title: 'Odysseus, technical website diagnostic',
      description:
        'Automated technical diagnostic for websites: accessibility, search optimisation, AI visibility signals and performance. A list of corrections ranked by priority, at a published price of EUR 1,600 excl. VAT.',
    },
  },
  '/offre': {
    fr: {
      title: 'Diagnostic technique complet | Odysseus',
      description:
        'Ce que couvre le diagnostic technique complet Odysseus, ce que contient le rapport, et comment le recevoir. Le prix publié figure plus bas sur la page.',
    },
    en: {
      title: 'Full technical diagnostic | Odysseus',
      description:
        'What the Odysseus full technical diagnostic covers, what the report contains, and how to receive it. The published price appears further down the page.',
    },
  },
  '/bot': {
    fr: {
      title: 'OdysseusBot | Odysseus',
      description:
        "Ce que fait le robot OdysseusBot lors de la visite d'un site : pages consultées, fréquence des requêtes, données conservées et durée, moyens de l'identifier ou de le bloquer.",
    },
    en: {
      title: 'OdysseusBot | Odysseus',
      description:
        'What the OdysseusBot crawler does when it visits a site: pages consulted, request frequency, data kept and for how long, and how to identify or block it.',
    },
  },
  '/confidentialite-prospection': {
    fr: {
      title: 'Prospection et données personnelles | Odysseus',
      description:
        "Comment Odysseus obtient et utilise les données des établissements contactés, et comment s'y opposer.",
    },
    en: {
      title: 'Prospecting and personal data | Odysseus',
      description:
        'How Odysseus obtains and uses the data of establishments it contacts, and how to opt out.',
    },
  },
  '/desinscription': {
    fr: {
      title: 'Désinscription | Odysseus',
      description:
        'Comment ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.',
    },
    en: {
      title: 'Opt-out | Odysseus',
      description: 'How to stop being contacted by Odysseus and have an online preview withdrawn.',
    },
  },
};
