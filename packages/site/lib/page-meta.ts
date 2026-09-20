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
      title: 'Odysseus, diagnostic technique avec préconisations',
      // Issue #213 item 5: trimmed from 198 to 157 characters so search
      // engines are much less likely to truncate it mid-sentence, while
      // keeping the approved "signaux techniques liés aux assistants IA"
      // and "tarif fixe" wording (see lib/marketing-copy.test.ts). Must
      // match app/layout.tsx's FR description exactly.
      description:
        'Diagnostic technique avec préconisations : accessibilité, référencement, rendu JavaScript, performance, signaux techniques liés aux assistants IA, tarif fixe 990 € HT.',
    },
    en: {
      title: 'Odysseus, technical diagnostic with recommendations',
      description:
        'Technical diagnostic with recommendations: accessibility, search, JavaScript rendering, performance and AI-assistant signals. Prioritised report, EUR 990 excl. VAT.',
    },
  },
  '/offre': {
    fr: {
      title: 'Le diagnostic Odysseus avec préconisations | Odysseus',
      description:
        'Les contrôles réalisés, les préconisations, le contenu du rapport, le délai et le tarif fixe de 990 € HT du diagnostic Odysseus.',
    },
    en: {
      title: 'The Odysseus diagnostic with recommendations | Odysseus',
      description:
        'The checks performed, recommendations, report contents, delivery process and fixed EUR 990 excl. VAT price of the Odysseus diagnostic.',
    },
  },
  '/bot': {
    fr: {
      // Issue #213 item 5: a bare "OdysseusBot" title was too short to be
      // a useful SERP result once combined with the template suffix.
      title: "OdysseusBot, le robot d'audit technique Odysseus",
      description:
        "Ce que fait OdysseusBot lorsqu'il visite un site : pages consultées, rythme des requêtes, données conservées et moyens de le bloquer.",
    },
    en: {
      title: "OdysseusBot, Odysseus's technical audit crawler",
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
  '/accessibilite': {
    fr: {
      title: "Démarche d'accessibilité | Odysseus",
      description:
        "La démarche d'accessibilité de ce site, ce qui a été vérifié, ce qui ne l'a pas encore été, et comment signaler un problème.",
    },
    en: {
      title: 'Accessibility approach | Odysseus',
      description:
        'What we have checked on this site, what has not been checked yet, and how to report a problem.',
    },
  },
};
