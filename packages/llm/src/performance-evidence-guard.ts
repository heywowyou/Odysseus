import type { ReportLanguage } from '@odysseus/core';
import type {
  WritingInput,
  WritingPassOutput,
  WritingPerformanceMetric,
} from './writing-schema.js';
import { unicodeWords } from './unicode-word-boundary.js';

export interface PerformanceEvidenceViolation {
  field: string;
  metric: WritingPerformanceMetric;
  text: string;
}

export const SUPPRESSED_METRIC_PATTERNS: Record<
  ReportLanguage,
  Record<WritingPerformanceMetric, RegExp>
> = {
  fr: {
    lcp: unicodeWords(/\b(?:LCP|Largest Contentful Paint)\b|contenu\s+principal/iu),
    cls: unicodeWords(
      /\b(?:CLS|Cumulative Layout Shift)\b|stabilit[ée]\s+visuelle|d[ée]calages?\s+(?:visuels?|cumulatifs?)|instabilit[ée]\s+(?:\S+\s+){0,2}de\s+l['’]affichage/iu,
    ),
    inp: unicodeWords(
      /\b(?:INP|Interaction to Next Paint)\b|r[ée]activit[ée]\s+aux\s+interactions?/iu,
    ),
    tbt: unicodeWords(/\b(?:TBT|Total Blocking Time)\b|scripts?\s+bloquants?/iu),
  },
  en: {
    lcp: unicodeWords(/\b(?:LCP|Largest Contentful Paint)\b|main\s+content\s+load/iu),
    cls: unicodeWords(
      /\b(?:CLS|Cumulative Layout Shift)\b|visual\s+stability|layout\s+(?:shift|instability)/iu,
    ),
    inp: unicodeWords(/\b(?:INP|Interaction to Next Paint)\b|interaction\s+responsiveness/iu),
    tbt: unicodeWords(/\b(?:TBT|Total Blocking Time)\b|blocking\s+scripts?/iu),
  },
};

/**
 * Plain-language phrasings of a suppressed metric that only matter in a
 * recommended action. A theme may still describe the laboratory observation
 * and explain why it is not the priority — the 2026-09-21 calibration shows
 * that context in real reports — but it may not tell the client to act on a
 * signal the reconciliation contract has ruled non-representative. Measured
 * over the 125 stored analyses: 13 French and 6 English recommended actions
 * match, every one of them a genuine "fix the suppressed signal" instruction,
 * and the 5 titles and business impacts these words also appear in are
 * deliberately left alone.
 */
export const SUPPRESSED_ACTION_PATTERNS: Record<
  ReportLanguage,
  Partial<Record<WritingPerformanceMetric, RegExp>>
> = {
  fr: {
    tbt: /t[âa]ches?\s+(?:\S+\s+){0,3}longues?|temps\s+de\s+blocage|scripts?\s+(?:JavaScript\s+)?qui\s+bloque/iu,
  },
  en: {
    tbt: /long\s+(?:\S+\s+){0,3}tasks?|blocking\s+time|(?:JavaScript|scripts?)\s+that\s+blocks?/iu,
  },
};

/** A sentence that rates a metric good, satisfactory or unremarkable, the
 *  two stored shapes being « la mesure du décalage cumulatif est bonne » and
 *  « Elle n'étaye donc pas une instabilité notable de l'affichage » (Hotel
 *  Europe, beside a critical CLS finding, plan 075 J2). */
const GOOD_RATING_PATTERNS: Record<ReportLanguage, readonly RegExp[]> = {
  fr: [
    unicodeWords(
      /\b(?:est|sont|reste|restent|semble|semblent|para[iî]t|appara[iî]t|demeure)\s+(?:\S+\s+){0,2}(?:bonne?s?|satisfaisante?s?|correcte?s?|excellente?s?|dans\s+les\s+seuils)\b/iu,
    ),
    unicodeWords(
      /\bn['’](?:[ée]taye|indique|montre|r[ée]v[èe]le|signale|traduit)\s+(?:donc\s+)?(?:pas|aucune?)\b/iu,
    ),
    unicodeWords(
      /\b(?:aucune?|pas\s+d['’]|pas\s+de)\s+(?:\S+\s+){0,2}(?:instabilit[ée]|probl[èe]mes?|d[ée]gradation|lenteur)\s+(?:\S+\s+){0,1}notables?\b/iu,
    ),
  ],
  en: [
    unicodeWords(
      /\b(?:is|are|remains?|looks?|seems?|stays?)\s+(?:\S+\s+){0,2}(?:good|fine|satisfactory|healthy|within\s+(?:the\s+)?thresholds?)\b/iu,
    ),
    unicodeWords(/\b(?:does|do)\s+not\s+(?:therefore\s+)?(?:show|indicate|support|reveal)\b/iu),
    unicodeWords(
      /\bno\s+(?:\S+\s+){0,2}(?:notable|significant|material)\s+(?:instability|problem|issue|degradation)\b/iu,
    ),
  ],
};

/** A sentence that qualifies a good median with what is wrong is allowed:
 *  « la valeur médiane reste bonne, mais cinq pages dépassent le seuil ». */
const QUALIFYING_CONTRAST: Record<ReportLanguage, RegExp> = {
  fr: unicodeWords(
    /\b(?:mais|cependant|toutefois|en\s+revanche|sauf|alors\s+que|tandis\s+que|n[ée]anmoins)\b/iu,
  ),
  en: unicodeWords(/\b(?:but|however|although|though|except|whereas|while|yet)\b/iu),
};

/** Plan 075 J2: the sentence rates one of `metrics` good without saying what
 *  is wrong, although a critical or serious finding says otherwise. A
 *  sentence with no metric name that continues the previous one (« Elle
 *  n'étaye donc pas… ») is caught by the CLS wording it carries. */
export function ratesSevereMetricGood(
  sentence: string,
  language: ReportLanguage,
  metrics: readonly WritingPerformanceMetric[],
): boolean {
  if (metrics.length === 0 || QUALIFYING_CONTRAST[language].test(sentence)) return false;
  const mentions = metrics.some((metric) =>
    SUPPRESSED_METRIC_PATTERNS[language][metric].test(sentence),
  );
  return mentions && GOOD_RATING_PATTERNS[language].some((pattern) => pattern.test(sentence));
}

function suppressedMention(
  text: string,
  language: ReportLanguage,
  suppressed: readonly WritingPerformanceMetric[],
): WritingPerformanceMetric | undefined {
  return suppressed.find((metric) => SUPPRESSED_METRIC_PATTERNS[language][metric].test(text));
}

function suppressedActionMention(
  text: string,
  language: ReportLanguage,
  suppressed: readonly WritingPerformanceMetric[],
): WritingPerformanceMetric | undefined {
  return (
    suppressedMention(text, language, suppressed) ??
    suppressed.find((metric) => SUPPRESSED_ACTION_PATTERNS[language][metric]?.test(text) === true)
  );
}

/**
 * A lab metric explicitly suppressed by the reconciliation contract may not
 * reappear anywhere in generated priority prose. This is intentionally
 * stricter than "do not lead with it": the deterministic Performance section
 * already explains the discrepancy, so priority prose gains nothing by
 * relitigating the anomalous signal.
 */
export function findPerformanceEvidenceViolations(
  input: WritingInput,
  output: WritingPassOutput,
): PerformanceEvidenceViolation[] {
  const suppressed = input.performanceEvidence.suppressedLabRecommendations;
  if (suppressed.length === 0) return [];

  const violations: PerformanceEvidenceViolation[] = [];
  const summaryMetric = suppressedMention(output.executiveSummary, input.language, suppressed);
  if (summaryMetric !== undefined) {
    violations.push({
      field: 'executiveSummary',
      metric: summaryMetric,
      text: output.executiveSummary,
    });
  }

  const inputByKey = new Map(input.themes.map((theme) => [theme.themeKey, theme]));
  for (const [themeIndex, theme] of output.themes.entries()) {
    if (inputByKey.get(theme.themeKey)?.category !== 'performance') continue;
    const fields = [
      {
        field: `themes[${themeIndex}](${theme.themeKey}).title`,
        text: theme.title,
      },
      {
        field: `themes[${themeIndex}](${theme.themeKey}).businessImpact`,
        text: theme.businessImpact,
      },
      ...theme.recommendedActions.map((text, actionIndex) => ({
        field: `themes[${themeIndex}](${theme.themeKey}).recommendedActions[${actionIndex}]`,
        text,
      })),
    ];
    for (const field of fields) {
      const metric = field.field.includes('.recommendedActions[')
        ? suppressedActionMention(field.text, input.language, suppressed)
        : suppressedMention(field.text, input.language, suppressed);
      if (metric !== undefined) violations.push({ ...field, metric });
    }
  }
  return violations;
}

/** Plan 075 M5: CrUX field data is fetched for the audited origin, never for
 *  one page (packages/scanner/src/crux.ts), yet two stored analyses wrote
 *  « les données de terrain montrent que l'affichage du plus grand élément
 *  visible de la page d'accueil dépasse le seuil attendu ». */
const FIELD_DATA_PATTERNS: Record<ReportLanguage, RegExp> = {
  fr: unicodeWords(
    /\b(?:CrUX|Chrome\s+UX)\b|donn[ée]es\s+(?:\S+\s+){0,1}(?:de\s+terrain|r[ée]elles)|(?:visiteurs|utilisateurs|internautes)\s+r[ée]els\b/iu,
  ),
  en: unicodeWords(/\b(?:CrUX|Chrome\s+UX|field\s+data|real(?:-|\s+)(?:users?|visitors?))\b/iu),
};

const ONE_PAGE_PATTERNS: Record<ReportLanguage, RegExp> = {
  fr: unicodeWords(/\bpage\s+d['’]accueil\b|\bcette\s+page\b/iu),
  en: unicodeWords(/\bhome\s*page\b|\bthis\s+page\b|\blanding\s+page\b/iu),
};

/** A sentence that sets the page against the whole site is allowed:
 *  « les données de terrain valent pour l'ensemble du site, pas seulement
 *  pour la page d'accueil ». */
const SITE_SCOPE_PATTERNS: Record<ReportLanguage, RegExp> = {
  fr: unicodeWords(
    /\b(?:ensemble\s+du\s+site|tout\s+le\s+site|site\s+entier|ensemble\s+des\s+pages|pas\s+seulement|pas\s+uniquement|non\s+seulement)\b/iu,
  ),
  en: unicodeWords(
    /\b(?:whole\s+site|entire\s+site|across\s+the\s+site|site-wide|sitewide|all\s+pages|not\s+(?:only|just))\b/iu,
  ),
};

/** The sentence attributes real-visitor field data to a single page. */
export function tiesFieldDataToOnePage(sentence: string, language: ReportLanguage): boolean {
  return (
    FIELD_DATA_PATTERNS[language].test(sentence) &&
    ONE_PAGE_PATTERNS[language].test(sentence) &&
    !SITE_SCOPE_PATTERNS[language].test(sentence)
  );
}
