import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * Issue #309: two register defects found in the production reports of
 * 2026-09-15/16, both on words a native French reader stops at.
 *
 * English web jargon left untranslated in French prose ("Les canonicals",
 * "erreurs de tap"). The table is the glossary the prompt shows and the
 * guard enforces, so the two cannot drift apart. It lists only terms with an
 * established French equivalent; a proper name such as hreflang, which is
 * the literal attribute the provider will search for, is not an anglicism.
 */
export const FRENCH_TERM_GLOSSARY: readonly {
  anglicism: string;
  french: string;
  pattern: RegExp;
}[] = [
  { anglicism: 'canonical(s)', french: 'adresse canonique', pattern: /\bcanonicals?\b/iu },
  { anglicism: 'tap', french: 'appui', pattern: /\btaps?\b/iu },
  {
    anglicism: 'crawl, crawler',
    french: "exploration, robot d'exploration",
    pattern: /\bcrawl(?:er|ers|ing)?\b/iu,
  },
  {
    anglicism: 'lazy loading',
    french: 'chargement différé',
    pattern: /\blazy[- ]?load(?:ing)?\b/iu,
  },
  { anglicism: 'responsive', french: 'adapté aux mobiles', pattern: /\bresponsive\b/iu },
];

/**
 * French words arranged in English structure. A native-speaker review of
 * the Hôtel Point France and Villas Foch reports (2026-09-19) found these in
 * the model's executive summaries and priority prose: each is a literal
 * rendering of an English consulting phrase ("complement this reading",
 * "content discovery", "serve images", "quick win"). Like the term glossary,
 * the prompt shows this table and the guard enforces it. Patterns stay
 * narrow on purpose: every hit costs a retry, so an entry names the exact
 * calque rather than every sentence that shares a word with it.
 */
export const FRENCH_CALQUE_GLOSSARY: readonly {
  calque: string;
  french: string;
  pattern: RegExp;
}[] = [
  {
    calque: 'complètent cette lecture',
    french: 'le rapport relève également',
    pattern: /\bcomplètent cette lecture\b/iu,
  },
  {
    calque: 'la découverte des contenus',
    french: 'la capacité des moteurs à trouver les contenus',
    pattern: /\bdécouverte des contenus\b/iu,
  },
  {
    calque: 'Sur la performance, …',
    french: 'En matière de performance, …',
    pattern: /(?:^|[.!?]\s+)Sur (?:la performance|l['’]accessibilité|le référencement)\b/u,
  },
  {
    calque: 'structurent les priorités',
    french: 'les principales priorités concernent',
    pattern: /\bstructurent les priorités\b/iu,
  },
  {
    calque: 'le remplissage visuel',
    french: "l'affichage progressif de la page",
    pattern: /\bremplissage visuel\b/iu,
  },
  {
    calque: 'servir du contenu, des images',
    french: 'fournir, transmettre',
    pattern:
      /\b(?:servez|servir|servent|sert)\s+(?:le|les|ces|du|des|ce|cette)\s+(?:contenus?|images?|fichiers?|code|pages?)\b/iu,
  },
  { calque: 'gain rapide', french: 'action rapide', pattern: /\bgains? rapides?\b/iu },
  { calque: 'remédiation', french: 'correction', pattern: /\bremédiations?\b/iu },
  {
    calque: 'la portée fonctionnelle',
    french: 'la nature et la portée des problèmes',
    pattern: /\bportée fonctionnelle\b/iu,
  },
  {
    calque: "l'identification structurée",
    french: 'la manière dont les données structurées identifient',
    pattern: /\bidentification structurée\b/iu,
  },
  {
    calque: 'libérer les interactions',
    french: "rendre l'interface interactive",
    pattern: /\blibérer (?:plus vite |plus rapidement )?les interactions\b/iu,
  },
  { calque: "l'accès visuel", french: "l'affichage", pattern: /\baccès visuel\b/iu },
  {
    calque: 'dans la mesure en laboratoire',
    french: "d'après les mesures de laboratoire",
    pattern: /\bdans la mesure (?:en|de) laboratoire\b/iu,
  },
  {
    calque: 'les familles de constats',
    french: 'les types de constats',
    pattern: /\bfamilles? de constats\b/iu,
  },
  {
    calque: 'les axes mesurés',
    french: 'les points les mieux étayés par les mesures',
    pattern: /\baxes (?:les plus )?(?:directement )?mesurés\b/iu,
  },
  {
    calque: "le statut d'obligation",
    french: "l'applicabilité de l'obligation",
    pattern: /\bstatut d['’]obligation\b/iu,
  },
  { calque: 'basique', french: 'simple', pattern: /\bbasiques?\b/iu },
  { calque: 'le scan', french: "l'analyse automatisée", pattern: /\bscans?\b/iu },
];

/**
 * A subjective overall impression of the site ("le site donne une
 * impression de contenu riche mais encore insuffisamment cadré"). No
 * scanner measures richness or framing, so the sentence is the model's own
 * verdict presented as the audit's. Scoped to the impression construction
 * itself: a consequence for a visitor ("un visiteur peut croire que la page
 * est vide") stays available.
 */
const SUBJECTIVE_IMPRESSION_PATTERNS: Record<ReportLanguage, RegExp> = {
  fr: /\b(?:donnent|donne|laissent|laisse|dégagent|dégage|renvoient|renvoie)\s+(?:une|l['’])\s*impression\s+(?:de|d['’])/iu,
  en: /\b(?:gives?|leaves?|creates?|conveys?)\s+(?:an|the)\s+impression\s+(?:of|that)\b/iu,
};

export interface ProseRegisterViolation {
  field: string;
  text: string;
  matched: string;
}

export function findProseRegisterViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
): ProseRegisterViolation[] {
  const violations: ProseRegisterViolation[] = [];
  for (const { field, text } of fields) {
    const impression = text.match(SUBJECTIVE_IMPRESSION_PATTERNS[language]);
    if (impression) {
      violations.push({ field, text, matched: `subjective impression "${impression[0]}"` });
    }
    if (language !== 'fr') continue;
    for (const { pattern, french } of FRENCH_TERM_GLOSSARY) {
      const anglicism = text.match(pattern);
      if (anglicism) {
        violations.push({ field, text, matched: `"${anglicism[0]}" instead of "${french}"` });
      }
    }
    for (const { pattern, french } of FRENCH_CALQUE_GLOSSARY) {
      const calque = text.match(pattern);
      if (calque) {
        violations.push({
          field,
          text,
          matched: `calque "${calque[0].trim()}" instead of "${french}"`,
        });
      }
    }
  }
  return violations;
}

function writingProseFields(output: WritingPassOutput): ProseField[] {
  const fields: ProseField[] = [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
  ];
  output.themes.forEach((theme, i) => {
    const prefix = `themes[${i}](${theme.themeKey})`;
    fields.push({ field: `${prefix}.title`, text: theme.title });
    fields.push({ field: `${prefix}.businessImpact`, text: theme.businessImpact });
    theme.recommendedActions.forEach((action, j) => {
      fields.push({ field: `${prefix}.recommendedActions[${j}]`, text: action });
    });
  });
  return fields;
}

export function findProseRegisterViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): ProseRegisterViolation[] {
  return findProseRegisterViolationsInFields(writingProseFields(output), language);
}

export const PROSE_REGISTER_RETRY_HINT =
  'Describe only what the audit measured and its consequence, never an overall impression of the site, and in French use the French term from the glossary in the instructions rather than the English word or the listed calque.';
