export interface HintsStrings {
  crawl: string;
  scan: string;
  score: string;
  qualification: string;
  review: string;
}

export const hints = {
  fr: {
    crawl:
      'Découverte des pages du site : le robot liste les URLs accessibles et charge chaque page une par une, avec un délai de politesse entre chaque requête.',
    scan: 'Les vérifications du contenu et de l’accessibilité couvrent chaque page. Les performances sont mesurées séparément sur des pages échantillons sélectionnées.',
    score:
      'Score versionné combinant la sévérité des problèmes mesurés et la capacité de l’établissement à les corriger.',
    qualification:
      'Décision automatique d’éligibilité : qualifié, mis de côté, rejeté, déjà démarché ou géré par le groupe.',
    review:
      'Revue humaine demandée quand l’identité de l’hôtel est ambiguë après rapprochement du catalogue.',
  },
  en: {
    crawl:
      'Discovering the site’s pages: the crawler lists the reachable URLs and loads each page one by one, with a polite delay between each request.',
    scan: 'Content and accessibility checks cover every page. Performance is measured separately on selected sample pages.',
    score:
      'A versioned score combining how serious the measured problems are and how able the establishment is to fix them.',
    qualification:
      'An automatic eligibility decision: qualified, on hold, rejected, already engaged, or handled by the group.',
    review:
      'A human review is requested when the hotel’s identity stays ambiguous after matching against the catalogue.',
  },
} satisfies { fr: HintsStrings; en: HintsStrings };
