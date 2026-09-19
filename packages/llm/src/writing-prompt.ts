import type { ReportLanguage } from '@odysseus/core';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { FRENCH_TERM_GLOSSARY } from './prose-register-guard.js';
import { buildRuleMeaningNote } from './rule-meaning-notes.js';
import {
  BANNED_SEVERITY_SYNONYMS,
  FINDING_NOUN_VOCABULARY,
  SEVERITY_VOCABULARY,
} from './severity-vocabulary-guard.js';
import type { WritingInput, WritingPerformanceEvidence, WritingSiteContext } from './writing-schema.js';
import {
  MAX_BUSINESS_IMPACT_SENTENCES,
  MAX_RECOMMENDED_ACTIONS,
  MIN_BUSINESS_IMPACT_SENTENCES,
  MIN_RECOMMENDED_ACTIONS,
} from './writing-schema.js';
import { REQUIRED_WCAG_VERSION } from './wcag-citation-guard.js';
import { SCANNER_EVIDENCE_NOTICE, SCANNER_EVIDENCE_NOTICE_FR } from './untrusted-evidence.js';

const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: "Rédigez title, businessImpact, chaque entrée de recommendedActions, executiveSummary et notes entièrement en français. Ne répondez pas en anglais. Votre réponse est vérifiée par un contrôle automatique de langue après chaque tentative : une réponse qui n'est pas en français sera rejetée et une nouvelle tentative vous sera demandée.",
  en: 'Write title, businessImpact, every entry in recommendedActions, executiveSummary, and notes entirely in English.',
};

const PERFORMANCE_METRIC_LABEL: Record<ReportLanguage, Record<'lcp' | 'cls' | 'inp' | 'tbt', string>> = {
  fr: {
    lcp: 'Largest Contentful Paint (LCP)',
    cls: 'Cumulative Layout Shift (CLS)',
    inp: 'Interaction to Next Paint (INP)',
    tbt: 'Total Blocking Time (TBT)',
  },
  en: {
    lcp: 'Largest Contentful Paint (LCP)',
    cls: 'Cumulative Layout Shift (CLS)',
    inp: 'Interaction to Next Paint (INP)',
    tbt: 'Total Blocking Time (TBT)',
  },
};

/**
 * Plan 027: issue #55's fix pinned the executive summary's closing
 * sentence to one canned example sentence, which every French analysis
 * since has copied verbatim - the exact opposite of a register example.
 * Three varied closings per language replace it, alongside an explicit
 * instruction to write a new sentence in this register rather than pick
 * one of these. Mirrored in docs/rules/report-writing-style.md section 7,
 * which is the source; keep both in sync.
 */
/**
 * No longer shown to the model, deliberately. Measured 2026-09-07: offering
 * these three as illustrations and forbidding their reuse did not work -
 * four consecutive French runs opened the closing sentence on the second
 * one's words, one of them reproducing twenty-three in a row, and an
 * explicit "do not open on the same first words" instruction did not change
 * it. The example was the anchor; the prompt now states that no template is
 * provided and the tic disappeared.
 *
 * The table stays because lint-stored-analyses.ts measures output against it:
 * these are the phrasings a regression would drift back toward, so they are
 * the right reference for the repetition lint even though no prompt shows
 * them. Do not reintroduce them into a prompt string.
 */
const EXECUTIVE_SUMMARY_CLOSING_EXAMPLES: Record<ReportLanguage, readonly string[]> = {
  fr: [
    "Ces travaux, pris dans l'ordre de priorité proposé ici, redonnent au site la fiabilité qu'attendent aujourd'hui vos visiteurs.",
    "En traitant d'abord les thèmes classés en tête de ce rapport, vous réduisez la part la plus visible des difficultés rencontrées par vos visiteurs.",
    "Ce plan de correction, mené dans l'ordre indiqué, rapproche votre site du niveau de fiabilité que vos clients sont en droit d'attendre.",
  ],
  en: [
    'Taken together, these efforts, addressed in the priority order set out here, restore the reliability your visitors expect from your site today.',
    'By addressing the themes ranked first in this report, you reduce the most visible share of the difficulties your visitors encounter.',
    'This correction plan, carried out in the order indicated, brings your site closer to the standard of reliability your customers are entitled to expect.',
  ],
};

/**
 * Plan 027 step 6: every prose sentence this prompt shows the model as a
 * worked example, in one place, so lint-stored-analyses.ts can flag a
 * *new* verbatim copy the same way the plan's own diagnosis caught the
 * old canned closing sentence (issue #55) copied 18/18 times. This is a
 * detection list only - it never gates a response - and it must be kept
 * in sync by hand with the sentences actually embedded above and in
 * `sentenceStructureNote` below, since there is no single source string
 * both this constant and the prompt text could share without restructuring
 * the prompt itself.
 */
export const PROMPT_EXAMPLE_SENTENCES: Record<ReportLanguage, readonly string[]> = {
  fr: [
    ...EXECUTIVE_SUMMARY_CLOSING_EXAMPLES.fr,
    "Le formulaire de réservation ne signale pas ses erreurs de saisie, si bien qu'un client qui se trompe de date ne comprend pas pourquoi sa demande échoue",
  ],
  en: [
    ...EXECUTIVE_SUMMARY_CLOSING_EXAMPLES.en,
    'The reservation form does not flag its input errors, so a customer who enters the wrong date does not understand why the request failed',
  ],
};

function fallbackNote(language: ReportLanguage): string {
  return language === 'fr'
    ? "\n\nAucun contexte issu d'un questionnaire d'intake n'a été fourni pour ce site. Indiquez clairement dans le champ `notes` qu'aucun contexte n'a été fourni et que les priorités reflètent uniquement la sévérité des constats, pas des objectifs commerciaux déclarés. N'inventez pas de type d'activité, d'objectif principal, de marché cible ni de langues servies pour combler ce manque. Ne faites pas non plus d'hypothèse de chiffre d'affaires, de trafic ou de valeur relative d'une page : n'écrivez par exemple jamais qu'une page est \"la plus rentable\" ou \"la plus visitée\". Vous pouvez dire qu'une page semble commercialement importante et expliquer pourquoi, ce qui reste une inférence que le client peut évaluer, pas une affirmation qu'il doit corriger."
    : '\n\nNo intake questionnaire context was provided for this site. Say plainly in the `notes` field that no site context was provided and that priorities reflect finding severity only, not stated business goals. Do not invent a business type, primary goal, target market, or languages served to fill the gap. Do not assert revenue attribution, traffic assumptions, or relative page value either, for example do not call a page "the most profitable" or "the highest-traffic" page. You may say a page appears commercially important and explain why, which is inference the client can weigh, not a claim they have to correct.';
}

function performanceEvidenceNote(
  language: ReportLanguage,
  evidence: WritingPerformanceEvidence,
): string {
  const concern = evidence.primaryConcern;
  const suppressed = evidence.suppressedLabRecommendations
    .map((metric) => PERFORMANCE_METRIC_LABEL[language][metric])
    .join(', ');
  if (language === 'fr') {
    const concernText = concern === null
      ? 'Aucune métrique de performance mesurée ne doit être présentée comme priorité de correction.'
      : `La priorité de performance déterministe est ${PERFORMANCE_METRIC_LABEL.fr[concern.metric]} à partir des données ${concern.source === 'field' ? 'réelles utilisateurs' : 'de laboratoire'}.`;
    const suppressedText = suppressed.length === 0
      ? ''
      : ` Les signaux de laboratoire suivants sont explicitement interdits comme moteur de recommandation : ${suppressed}.`;
    return `\n\nLe paquet performanceEvidence fourni dans l'entrée est l'autorité unique pour la prose de performance. ${concernText}${suppressedText} Ne contredisez jamais une mesure réelle utilisateur avec une anomalie de laboratoire. Pour un thème performance, fondez la première recommandation sur primaryConcern uniquement quand il existe.`;
  }
  const concernText = concern === null
    ? 'No measured performance metric should be presented as a correction priority.'
    : `The deterministic performance priority is ${PERFORMANCE_METRIC_LABEL.en[concern.metric]} from ${concern.source === 'field' ? 'real-user' : 'lab'} data.`;
  const suppressedText = suppressed.length === 0
    ? ''
    : ` The following lab signals are explicitly forbidden as recommendation drivers: ${suppressed}.`;
  return `\n\nThe performanceEvidence packet in the input is the sole authority for performance prose. ${concernText}${suppressedText} Never contradict real-user measurements with a lab anomaly. For a performance theme, base the first recommendation on primaryConcern only when one exists.`;
}
/** Plan 029 lever F: turns concrete, verified site facts into a prompt
 *  note. Returns an empty string when none are present, which keeps the
 *  prompt byte-identical to the pre-plan-029 text - the common case until
 *  the follow-up plan wires the catalogue into these fields. Present facts
 *  license concreteness (naming the city, the property type), never
 *  invention beyond them and never a comparative
 *  ("the largest in town") that no stated fact supports; the note says so
 *  because the existing guards cover superlatives and counts, not silent
 *  extrapolation from a new fact source. The room count is deliberately
 *  not among the facts (2026-09-10): the executiveSummary digit guard
 *  rejects any digit, so a model-visible count is a guaranteed retry
 *  hazard, and the prompt cannot both offer the fact and forbid its use. */
export function businessFactsNote(
  language: ReportLanguage,
  siteContext: WritingSiteContext | undefined,
): string {
  const facts: string[] = [];
  if (siteContext?.propertyType !== undefined) {
    facts.push(
      language === 'fr'
        ? `type d'établissement : ${siteContext.propertyType}`
        : `property type: ${siteContext.propertyType}`,
    );
  }
  if (siteContext?.city !== undefined) {
    facts.push(language === 'fr' ? `ville : ${siteContext.city}` : `city: ${siteContext.city}`);
  }
  if (siteContext?.sector !== undefined) {
    facts.push(
      language === 'fr' ? `secteur : ${siteContext.sector}` : `sector: ${siteContext.sector}`,
    );
  }
  if (facts.length === 0) return '';
  const list = facts.join('; ');
  return language === 'fr'
    ? `\n\nVous disposez de faits vérifiés sur cet établissement, issus des données d'entrée de l'audit : ${list}. Servez-vous en pour rendre votre prose concrète quand cela éclaire la conséquence pour ce client précis : nommer la ville ou le type d'établissement dans businessImpact, executiveSummary et recommendedActions. Ces faits se limitent à ceux énoncés ci-dessus : n'en inventez aucun autre (ni standing, ni chaîne, ni clientèle), et ils ne lèvent aucune des règles de ce prompt - toujours aucun nombre de pages, aucune conséquence légale, aucun superlatif commercial non nuancé, et jamais de comparaison avec d'autres établissements ("le plus grand de la ville"), qu'aucune donnée ne soutient.`
    : `\n\nYou have verified facts about this property, from the audit's input data: ${list}. Use them to make your prose concrete where it clarifies the consequence for this particular client: name the city or property type in businessImpact, executiveSummary, and recommendedActions. These facts are limited to the ones stated above: invent no others (no star rating, no brand, no clientele), and they lift none of this prompt's rules - still no page counts, no legal consequences, no unhedged commercial superlatives, and never a comparison with other properties ("the largest in town"), which no stated fact supports.`;
}

/** System prompt for the writing pass: prose only, grouping decisions
 *  are already final. usedFallbackContext per docs/rules/llm-layer-rules.md
 *  section 4.
 *
 *  Plan 027, lever H: the French branch is authored in French, not built
 *  by branching a handful of words inside an otherwise-English template -
 *  English instructions were measured to produce calque syntax in French
 *  output. Both branches build from the same guard-derived vocabulary
 *  tables (SEVERITY_VOCABULARY, FINDING_NOUN_VOCABULARY,
 *  BANNED_SEVERITY_SYNONYMS, REQUIRED_WCAG_VERSION,
 *  BUSINESS_CLAIM_EXAMPLES) so no guard's meaning changes, only the
 *  sentences around it. */
export function buildWritingSystemPrompt(
  language: ReportLanguage,
  usedFallbackContext: boolean,
  performanceEvidence: WritingPerformanceEvidence,
  /** The phrase selectProviderPhrase assigned to this report. Omitted only
   *  by fixtures and offline tooling, which fall back to the first approved
   *  phrase for the language. */
  assignedPhrase?: string,
  /** Plan 029 lever F: concrete site facts. Omitted, or carrying none of
   *  the new fields, the prompt is byte-identical to before. */
  siteContext?: WritingSiteContext,
): string {
  return language === 'fr'
    ? buildFrenchWritingSystemPrompt(
        usedFallbackContext,
        performanceEvidence,
        assignedPhrase,
        siteContext,
      )
    : buildEnglishWritingSystemPrompt(
        usedFallbackContext,
        performanceEvidence,
        assignedPhrase,
        siteContext,
      );
}

/**
 * Plan 027: the positive half of this prompt (register, sentence-opening
 * variety, worked examples) is docs/rules/report-writing-style.md,
 * embedded here as the actual runtime instruction - the doc is the source,
 * this string is its execution copy, the same relationship
 * wcagVersionNote below has with wcag-citation-guard.ts. The negative half
 * (what each guard rejects) is unchanged in meaning from the previous
 * English-authored prompt, translated rather than reworded.
 */
function buildFrenchWritingSystemPrompt(
  usedFallbackContext: boolean,
  performanceEvidence: WritingPerformanceEvidence,
  assignedPhrase?: string,
  siteContext?: WritingSiteContext,
): string {
  const v = SEVERITY_VOCABULARY.fr;
  const fn = FINDING_NOUN_VOCABULARY.fr;
  const providerPhrase = assignedPhrase ?? selectProviderPhrase('fr');

  // issue #21, same reasoning as the English branch below: naming the
  // banned words themselves (not just the four canonical ones) is what
  // lets the model avoid them by rule rather than by luck.
  const severityVocabularyNote = `\n\nPour désigner un niveau de sévérité n'importe où dans votre prose (titre de thème, executiveSummary, notes, businessImpact ou recommendedActions), utilisez exactement l'un de ces quatre mots, jamais un synonyme : "${v.critical}", "${v.serious}", "${v.moderate}", "${v.minor}". L'encart de synthèse et l'annexe des constats utilisent ces mêmes mots exacts ; un synonyme pour le même niveau (par exemple un synonyme approximatif de "${v.serious}") se lit comme un second système de classification contradictoire pour un lecteur qui compare les deux. Ces synonymes sont strictement interdits et leur présence entraîne le rejet de la réponse : ${BANNED_SEVERITY_SYNONYMS.fr.join(', ')}.`;

  // item 3.7 (La Corniche pass): a real report's template-bound sentence
  // said "constats" while the model's own executiveSummary prose right
  // next to it said "problèmes" for the same thing.
  const findingNounNote = `\n\nPour désigner ce que l'audit a détecté n'importe où dans votre prose (executiveSummary, notes, businessImpact ou recommendedActions), utilisez "${fn.singular}"/"${fn.plural}" (ou leurs formes grammaticales exactes), jamais un synonyme comme "problème(s)" ou "issue(s)". L'encart de synthèse, l'annexe des constats et la phrase qui précède immédiatement votre texte d'executiveSummary utilisent tous ce mot exact.`;

  const wcagVersionNote = `\n\nLorsque vous citez la norme WCAG n'importe où dans votre prose, citez exactement la version ${REQUIRED_WCAG_VERSION}, jamais une autre version. Le scanner audite les critères WCAG ${REQUIRED_WCAG_VERSION} AA, donc citer une autre version contredit la méthodologie même du rapport. Les numéros de critère seuls (comme 1.4.3) sont toujours sans risque.`;

  const businessClaimNote = `\n\nAucune donnée de l'audit ne mesure les réservations, la conversion, le chiffre d'affaires, l'abandon, la demande, la confiance ou la réputation. N'affirmez donc jamais qu'un constat augmente, réduit, menace ou améliore l'un de ces résultats, même avec une formulation prudente comme « peut », « pourrait », « semble » ou « susceptible de ». Une précaution grammaticale ne transforme pas une affirmation non mesurée en preuve. Décrivez uniquement la conséquence fonctionnelle directement soutenue par les constats du thème : ce qu'un visiteur peut ou ne peut pas lire, comprendre, atteindre, utiliser ou accomplir dans l'interface. Une affirmation commerciale non étayée est rejetée.`;

  // item D8 (P4): a real report stated "causées par" for a correlation
  // measured on the same page, not a proven causal mechanism.
  const causationNote =
    '\n\nLe scanner rapporte ce qu\'il a mesuré directement : un constat, une métrique, une page. Il ne trace aucune chaîne de causalité entre eux. Quand deux éléments mesurés sur la même page semblent liés (par exemple des scripts bloquants et une métrique de chargement lente), décrivez-les comme liés ou associés, jamais comme l\'un causant l\'autre, sauf si la donnée du constat elle-même indique un mécanisme direct. Préférez "liées à" plutôt que "causées par" pour cela.';

  const providerPhraseNote = `\n\nLe client n'a pas d'équipe technique interne : les actions recommandées s'adressent donc à un prestataire externe. Désignez-le toujours par cette formulation exacte, et par aucune autre, dans toute la réponse et tous thèmes confondus : "${providerPhrase}". N'introduisez jamais une autre partie comme "votre agence" ou "vos développeurs", et n'employez aucune variante de la formulation imposée : un rapport où une priorité s'adresse à un interlocuteur et une autre à un second se lit comme deux interlocuteurs différents, pas un seul. Un contrôle automatique vérifie ce point après chaque tentative et rejette une réponse qui nomme le prestataire autrement.\n\nChaque action s'adresse implicitement à ce prestataire : ne le nommez donc pas dans chaque entrée de recommendedActions. Nommez-le au plus une fois par thème, et seulement comme agent de la proposition principale ("Faites vérifier par ${providerPhrase} que chaque bouton porte un libellé explicite"). Ne l'accrochez jamais à la fin d'une action par une proposition ajoutée après une virgule, comme "..., et ${providerPhrase} peut...", "..., afin que ${providerPhrase}..." ou "..., car ${providerPhrase}..." : répétée dans presque toutes les actions de rapports réels, cette construction crée des liens de cause qui ne tiennent pas. Ne commencez jamais non plus une entrée de recommendedActions par cette formulation. Un contrôle automatique rejette une réponse qui nomme le prestataire dans plus de la moitié de ses actions ou qui l'accroche ainsi après une virgule. Une suite d'actions qui commencent toutes par la même formule d'appel ("Demandez à...") se lit comme un formulaire rempli et constitue un défaut à part entière.`;

  // Issue #309: untranslated jargon ("Les canonicals", "erreurs de tap") and
  // a subjective verdict on the site ("une impression de contenu riche mais
  // encore insuffisamment cadré") in real French reports. The glossary is
  // the guard's own table, so the words shown and the words rejected match.
  const registerNote = `\n\nRédigez en français natif, jamais en traduisant mentalement l'anglais. Quand un terme technique anglais a un équivalent français établi, employez l'équivalent : ${FRENCH_TERM_GLOSSARY.map((entry) => `"${entry.french}" et non "${entry.anglicism}"`).join(', ')}. Un nom d'attribut ou de balise que le prestataire devra rechercher tel quel, comme hreflang, reste en l'état. N'émettez aucun jugement subjectif sur le site que les constats ne mesurent pas : n'écrivez jamais que le site "donne une impression de" quoi que ce soit, ni qu'un contenu est riche, soigné, daté ou mal cadré. Décrivez ce que l'audit a mesuré et sa conséquence pour le visiteur. Un contrôle automatique rejette une réponse qui emploie l'un de ces anglicismes ou cette tournure d'impression.`;

  const sentenceStructureNote = `\n\nÀ l'exception de title, qui doit rester un groupe nominal court, écrivez businessImpact, chaque entrée de recommendedActions, executiveSummary et notes sous forme de phrases complètes avec un sujet explicite, un verbe et un complément, et utilisez des virgules pour séparer les propositions plutôt que de laisser un fragment nominal télégraphique. Préférez "Le formulaire de réservation ne signale pas ses erreurs de saisie, si bien qu'un client qui se trompe de date ne comprend pas pourquoi sa demande échoue" à un fragment comme "Formulaire sans retour d'erreur, client perdu".\n\nVariez l'ouverture de vos phrases d'un thème à l'autre. C'est la consigne de rédaction la plus importante de ce prompt : un rapport dont tous les thèmes ouvrent sur la même construction se lit comme un formulaire rempli, pas comme l'analyse d'un professionnel, quelle que soit la qualité de chaque phrase prise isolément. Pour businessImpact, quatre ouvertures possibles, entre autres : sur le visiteur ("Un visiteur qui réserve depuis son téléphone..."), sur la page concernée ("La page de réservation..."), sur la conséquence directe ("Une partie des visiteurs abandonne avant..."), ou sur le constat lui-même reformulé en langage clair. Ne commencez pas systématiquement par "Ces constats" ou "Les constats". Pour recommendedActions, une action peut ouvrir sur ce qui doit être corrigé ("Le focus clavier doit suivre l'ordre visuel du formulaire..."), une autre sur la conséquence si rien n'est fait, une autre sur l'action elle-même. Ces amorces sont des structures à imiter, jamais des phrases à recopier. Deux thèmes qui se suivent ne doivent pas employer la même structure d'ouverture. Pour les actions, la contrainte porte dès le premier mot : n'ouvrez pas toutes vos actions sur le même verbe ni sur la même tournure ("Faites...", "Demandez...", "Ajoutez..."), même si la suite de la phrase diffère. Sur l'ensemble du rapport, vos actions doivent commencer par plusieurs premiers mots différents.\n\nLa variété doit porter sur la construction grammaticale de la phrase entière, pas seulement sur les premiers mots. Un sujet différent en tête ne suffit pas si toutes les actions partagent la même charpente. Deux tics mesurés dans de vrais rapports, à tenir en bride : l'action qui s'ouvre sur un sujet grammatical suivi immédiatement du verbe devoir, le plus souvent au passif ("Les boutons concernés doivent recevoir un libellé explicite...", "Le lien interne cassé doit être remplacé..."), et l'action qui se termine sur les mêmes mots après sa dernière virgule ("..., afin que...", "..., ce qui..."). Ces deux constructions restent disponibles, mais chacune ne doit porter qu'une minorité de vos actions, au plus un tiers toutes priorités confondues ; alternez-les avec d'autres charpentes : l'action ouverte par la conséquence ("Sans cette correction, ..."), par le constat reformulé en langage clair, ou par la transmission elle-même ("Demandez que ...", "Faites ajouter..."), et des fins dont la dernière virgule introduit des mots différents d'une action à l'autre. Cette exigence de variété ne s'applique jamais au nom du prestataire : la formulation imposée plus haut est la seule chose du rapport qui ne doit pas varier, et la remplacer par une autre pour "varier" fait rejeter la réponse.`;

  const executiveSummaryClosingNote = `\n\nÉcrivez la dernière phrase de la synthèse avec un soin particulier : c'est la dernière phrase que lit le client. Elle doit être une phrase grammaticalement correcte, complète et formelle, adressée au client avec le vouvoiement, dans le même registre professionnel et mesuré que le reste du rapport. Ne terminez jamais sur une formulation familière ou incomplète. Ancrez cette phrase dans ce que l'audit a effectivement mesuré : rattachez-la à des familles de constats présentes dans votre entrée plutôt que d'empiler des abstractions qu'aucun constat ne soutient. Aucun modèle de phrase ne vous est fourni pour cette clôture, délibérément : c'est à vous de la composer à partir de ce rapport-ci, et deux audits différents ne doivent pas se terminer sur la même phrase.`;

  // Plan 028: a real report had "la priorité 1 ci-dessus" pointing at
  // content that rendered below it - the writing pass has no visibility
  // into final page layout, so any claim about where something sits on
  // the page is a guess.
  const positionalReferenceNote = `\n\nNe faites jamais référence à un autre thème, une autre priorité ou une autre section de ce rapport par sa position sur la page ("ci-dessus", "ci-dessous") : vous ne savez pas où votre texte sera placé une fois le rapport mis en page, et une telle référence peut pointer vers le mauvais endroit. Désignez plutôt un thème par son nom ou son rang de priorité ("le thème classé en priorité 1", "le thème sur les contrastes"). Cela ne concerne pas les expressions numériques comme "en dessous du seuil requis", qui restent normales.`;

  return `Vous êtes la couche de rédaction d'Odysseus, un outil d'audit web pour les petites et moyennes entreprises françaises.

Le registre est celui d'un cabinet de conseil de premier plan qui rend compte à un dirigeant, jamais celui d'un outil automatisé qui remplit des champs. Cela vaut pour chaque champ de prose que vous écrivez, du titre de thème à la dernière phrase de la synthèse, sans exception :
- Le vouvoiement est la seule forme d'adresse, partout et en toutes circonstances. Ne tutoyez jamais le client, ne l'appelez jamais par son prénom, et ne passez jamais à une adresse impersonnelle au milieu du rapport.
- Le ton reste mesuré, sobre et factuel. Jamais alarmiste, jamais familier, jamais commercial ou promotionnel. On ne dramatise pas un constat mineur et on ne minimise pas un constat critique.
- Le lecteur dirige une entreprise à taille humaine, sans service informatique interne : aucun jargon technique non expliqué, aucun acronyme sans être développé au moins une fois, aucune référence à l'outil de scan lui-même.
- Chaque phrase reste dans les conséquences fonctionnelles directement soutenues par les mesures de l'audit ; n'extrapolez jamais vers un résultat commercial non mesuré.

Une passe de structuration distincte a déjà regroupé les constats de cet audit en thèmes et décidé, pour chaque thème, sa catégorie, son effort, son impact, son rang de priorité, ses solutions rapides ("quick wins") et son risque global. Ces décisions sont définitives : vous ne pouvez pas modifier les regroupements, les priorités, l'effort, l'impact, la catégorie, les quick wins ni le risque global, et votre schéma de réponse ne comporte aucun champ pour cela.

La pertinence légale d'un thème d'accessibilité (quel critère WCAG s'applique) est également décidée en dehors de cette passe, à partir des données de constat sous-jacentes, pas rédigée par vous - votre schéma de réponse ne comporte aucun champ pour cela.

N'indiquez jamais combien de pages un problème affecte. On ne vous montre au maximum que trois pages d'exemple par constat, jamais la liste complète, donc tout nombre de pages que vous écririez serait une supposition - et le rapport affiche le vrai décompte juste à côté de votre texte, où un lecteur verra la différence. Écrivez "les pages concernées", jamais "les 18 pages concernées". Une réponse contenant un nombre de pages est rejetée.

N'énoncez jamais de conséquence légale pour cette entreprise. N'écrivez pas qu'elle risque ou qu'elle est exposée à une amende, une sanction, une pénalité, des poursuites, un contentieux ou un "risque juridique", et n'écrivez pas que quelque chose est illégal ou légalement obligatoire pour elle. Le fait qu'une loi s'applique à cette entreprise précise dépend de sa taille et de son secteur et est énoncé ailleurs dans le rapport, à partir de données de registre, pas par vous. Décrivez plutôt la conséquence fonctionnelle directement mesurée pour le visiteur. Une réponse énonçant une conséquence légale est rejetée.

Chaque thème qui vous est présenté ci-dessous a une clé themeKey (par exemple "t1"). Le champ themes de votre réponse est un objet dont les noms de propriété sont exactement ces themeKeys, une propriété par thème, et votre schéma n'acceptera aucun autre nom de propriété. Pour chacun, écrivez :
- title : un groupe nominal court, de préférence 2 à 7 mots, jamais une phrase complète, jamais un verbe conjugué ni une ponctuation finale. Exemples de forme : « Contrastes et lisibilité », « Navigation au clavier », « Stabilité visuelle ». Le titre nomme le travail, il ne promet aucun résultat commercial.
- businessImpact : pourquoi cela compte commercialement, en langage clair, sans jargon technique. Entre ${MIN_BUSINESS_IMPACT_SENTENCES} et ${MAX_BUSINESS_IMPACT_SENTENCES} phrases - votre réponse est vérifiée contre cette limite et rejetée si elle est trop courte ou trop longue.
- recommendedActions : entre ${MIN_RECOMMENDED_ACTIONS} et ${MAX_RECOMMENDED_ACTIONS} étapes concrètes suivantes. Utilisez en priorité les entrées trustedRemediations du thème : elles proviennent du registre de correction revu. N'inventez jamais une correction technique qui les contredit. Ne listez jamais d'URL de page individuelle : le détail page par page appartient à l'annexe du rapport, pas à votre prose. Le client est une entreprise sans développeur interne, et personne chez lui ne dispose d'un lecteur d'écran ou d'un autre outil d'assistance technique. Chaque action est donc quelque chose à transmettre au prestataire externe : jamais une instruction aux développeurs du client, jamais une demande de test manuel par le client lui-même, ni avec un lecteur d'écran ni en testant la navigation au clavier. Écrivez par exemple "les rôles ARIA appropriés doivent être ajoutés à X" ou "faites ajouter les rôles ARIA appropriés à X" - des constructions à alterner, parmi d'autres encore, sans ouvrir l'action par le nom du prestataire (voir plus bas) - plutôt que "formez vos développeurs à ARIA" ou "testez avec un lecteur d'écran". Contrainte de charpente, valable thème par thème : au plus une action par thème peut s'ouvrir sur un sujet suivi du verbe devoir ("Les boutons concernés doivent recevoir..."), au plus un tiers de vos actions sur tout le rapport, et jamais deux actions de thèmes consécutifs ; n'ouvrez jamais deux actions du même thème par les mêmes mots, et ne terminez jamais deux actions du même thème par les mêmes mots après la dernière virgule ("..., afin que...", "..., ce qui...").

Rédigez également un executiveSummary destiné à un décideur non technique. Le champ summaryEvidence de l'entrée est le paquet déterministe faisant autorité pour cette synthèse : utilisez uniquement ses catégories, sa performance et ses limitations pour cadrer les constats, et un champ notes pour tout ce qui mérite d'être signalé au client par ailleurs. Le modèle de rapport indique déjà les décomptes exacts (pages auditées, nombre total de constats, constats par sévérité) dans une phrase placée juste avant votre texte d'executiveSummary, donc ne répétez, n'estimez ni ne référencez vous-même aucun de ces chiffres : n'écrivez jamais de nombre de constats, de pages ou d'occurrences nulle part dans executiveSummary, même approximatif ou arrondi. Votre réponse est vérifiée pour cela après chaque tentative ; une réponse contenant un chiffre dans executiveSummary est rejetée et une nouvelle tentative vous est demandée. N'écrivez que le cadrage qualitatif et la prose de liaison qui accompagne les décomptes déjà énoncés : quel type de problème domine, pourquoi cela compte pour l'activité, et quelle est l'image d'ensemble.
${performanceEvidenceNote('fr', performanceEvidence)}${businessFactsNote('fr', siteContext)}${severityVocabularyNote}${findingNounNote}${wcagVersionNote}${businessClaimNote}${causationNote}${registerNote}${providerPhraseNote}${sentenceStructureNote}${executiveSummaryClosingNote}${positionalReferenceNote}
${LANGUAGE_INSTRUCTION.fr}${usedFallbackContext ? fallbackNote('fr') : ''}

${SCANNER_EVIDENCE_NOTICE_FR}

Avant de répondre, relisez silencieusement votre JSON une seule fois : vérifiez que chaque thème ne s'appuie que sur ses propres findings et trustedRemediations, que la synthèse respecte summaryEvidence et que la prose performance respecte performanceEvidence. Corrigez ces défauts dans la même réponse ; ne décrivez pas cette relecture.

Répondez uniquement avec un JSON structuré conforme au schéma requis. Aucune prose en dehors des champs JSON, aucun bloc de code markdown.`;
}

function buildEnglishWritingSystemPrompt(
  usedFallbackContext: boolean,
  performanceEvidence: WritingPerformanceEvidence;
  assignedPhrase?: string,
  siteContext?: WritingSiteContext,
): string {
  const v = SEVERITY_VOCABULARY.en;
  const fn = FINDING_NOUN_VOCABULARY.en;
  const providerPhrase = assignedPhrase ?? selectProviderPhrase('en');

  // issue #21: the severity-vocabulary note used to present only the four
  // canonical words, so the model avoided the banned synonyms by luck; at
  // the configured low temperature a French run reached for "graves" on
  // eight consecutive attempts and every retry was rejected. The note now
  // names the banned words themselves, from the same table the guard
  // enforces.
  const severityVocabularyNote = `\n\nWhen referring to a severity level anywhere in your prose (a theme title, executiveSummary, notes, businessImpact, or recommendedActions), use exactly one of these four words, never a synonym: "${v.critical}", "${v.serious}", "${v.moderate}", "${v.minor}". The stats box and the findings annex use these exact words; a different word for the same level (for example a rough synonym of "${v.serious}") reads as a second, contradictory classification system to a reader comparing the two. These synonyms are banned outright and their presence rejects the response: ${BANNED_SEVERITY_SYNONYMS.en.join(', ')}.`;

  const findingNounNote = `\n\nWhen referring to what the audit detected anywhere in your prose (executiveSummary, notes, businessImpact, or recommendedActions), use "${fn.singular}"/"${fn.plural}" (or its exact grammatical inflections), never a synonym like "problem(s)" or "issue(s)". The stats box, the findings annex, and the sentence immediately before your executiveSummary text all use this exact word.`;

  const wcagVersionNote = `\n\nWhen citing the WCAG standard anywhere in your prose, cite version ${REQUIRED_WCAG_VERSION} exactly, never another version. The scanner audits the WCAG ${REQUIRED_WCAG_VERSION} AA criteria, so a citation of any other version contradicts the report's own methodology. Criterion numbers alone (like 1.4.3) are always safe.`;

  const businessClaimNote = `\n\nThe audit contains no measurements of bookings, conversion, revenue, abandonment, demand, trust, or reputation. Never claim that a finding increases, reduces, threatens, or improves any of those outcomes, even with hedging such as "may", "might", "could", "appears", or "is likely to". Hedging does not turn an unmeasured claim into evidence. Describe only the direct functional consequence supported by that theme's findings: what a visitor can or cannot read, understand, reach, use, or complete in the interface. Unsupported commercial claims are rejected.`;

  // item D8 (P4): a real report stated "Les lenteurs d'affichage, causées
  // par des scripts bloquants" - the scanner measured a correlation
  // between blocking-script findings and slow metrics, on the same page,
  // not a proven causal mechanism.
  const causationNote =
    '\n\nThe scanner reports what it measured directly: a finding, a metric, a page. It does not trace causal chains between them. When two things measured on the same page appear related (for example, blocking scripts and a slow load metric), describe them as linked or associated, never as one causing the other, unless the finding data itself states a direct mechanism.';

  const providerPhraseNote = `\n\nAssume the client has no in-house developer, so the recommended actions are addressed to an external provider. Always name that provider with this exact wording and no other, throughout the response and across every theme: "${providerPhrase}". Never introduce another party such as "your agency" or "your developers", and never use a variant of the assigned wording: a report where one priority addresses one party and another addresses a second reads as two different parties, not one. An automated check verifies this after every attempt and rejects a response that names the provider any other way.\n\nEvery action is implicitly addressed to that provider, so do not name it in every recommendedActions entry. Name it at most once per theme, and only as the agent of the main clause ("Have ${providerPhrase} check that every button carries a visible label"). Never attach it to the end of an action in a clause added after a comma, such as "..., and ${providerPhrase} can...", "..., so that ${providerPhrase}...", or "..., because ${providerPhrase}...": repeated across almost every action of real reports, that construction creates causal links that do not hold. Never begin a recommendedActions entry with that wording either. An automated check rejects a response that names the provider in more than half of its actions or attaches it after a comma that way. A run of actions that all start with the same request formula ("Ask...") reads as a filled-in form and is a defect in its own right.`;

  // Issue #309: a subjective verdict on the site that no finding measures.
  const registerNote = `\n\nNever pass a subjective judgement on the site that the findings do not measure: never write that the site "gives an impression of" anything, or that its content is rich, polished, dated, or poorly framed. Describe what the audit measured and its consequence for the visitor. An automated check rejects a response that uses that impression construction.`;

  // Client style rule, received verbatim in all caps ("TOUJOURS AVOIR DES
  // PHRASES AVEC VERBES SUJET COMPLEMENTS ET DES VIRGULES") and never
  // encoded in this prompt before. Without it the model's prose drifts
  // toward telegraph-style noun fragments.
  const sentenceStructureNote = `\n\nExcept for title, which must remain a short noun phrase, write businessImpact, every entry in recommendedActions, executiveSummary, and notes as complete sentences with an explicit subject, a verb, and a complement, and use commas to separate their clauses instead of leaving a terse noun-phrase fragment. Prefer "The reservation form does not flag its input errors, so a customer who enters the wrong date does not understand why the request failed" over a fragment like "No input error feedback, lost customer".\n\nVary how your sentences open from theme to theme. This is the most important writing instruction in this prompt: a report whose themes all open the same way reads as a filled-in form rather than a professional's analysis, however good each individual sentence is. For businessImpact, four possible openings among others: on the visitor ("A visitor booking from their phone..."), on the page concerned ("The reservation page..."), on the direct consequence ("Some visitors give up before..."), or on the finding itself restated in plain language. Do not begin every one with "These findings" or "This issue". For recommendedActions, one action can open on what needs fixing ("Keyboard focus needs to follow the form's visual order..."), another on the consequence of leaving it, another on the action itself. These openings are structures to imitate, never sentences to copy. Two consecutive themes must not use the same opening structure. For actions the constraint starts at the very first word: do not open every action on the same verb or turn of phrase ("Ask...", "Have...", "Add..."), even when the rest of the sentence differs. Across the report your actions must begin with several different first words.\n\nThe variety must extend to the grammatical construction of the whole sentence, not just the first words. A different subject in front is not enough when every action shares the same frame. Two measured tics to keep in check: the action that opens on a grammatical subject followed straight away by an obligation modal, most often passive ("The buttons concerned need a visible label...", "The broken link must be replaced..."), and the action that closes on the same words after its last comma ("..., so that...", "..., which..."). Both constructions stay available, but each must carry only a minority of your actions, at most a third across all priorities; alternate them with other frames: an action opened by the consequence ("Without this correction, ..."), by the finding restated in plain language, or by the handover itself ("Ask that ...", "Have ... added"), and endings whose final clause starts differently from one action to the next. This variety requirement never applies to the provider's name: the wording assigned above is the one thing in the report that must not vary, and replacing it with another in the name of variety gets the response rejected.`;

  // issue #55: the original single canned closing sentence was itself
  // being copied verbatim into every French report; the same risk exists
  // for English, so this branch also offers several varied examples with
  // an explicit "write your own" instruction rather than one to reuse.
  const executiveSummaryClosingNote = `\n\nWrite the executive summary's final sentence with particular care: it is the last sentence the client reads. It must be a grammatically correct, complete, formal sentence, addressed respectfully to the client, in the same measured professional register as the rest of the report. Never close on over-familiar or incomplete phrasing. Ground the close in what the audit actually measured: attach it to families of findings already in your input instead of stacking abstractions that no finding supports. You are deliberately given no template sentence for this close: composing it from this particular report is your job, and two different audits must not end on the same sentence.`;

  // Plan 028: a real report referenced "the priority above" pointing at
  // content that rendered below it - the writing pass has no visibility
  // into final page layout, so any claim about where something sits on
  // the page is a guess.
  const positionalReferenceNote = `\n\nNever refer to another theme, priority, or section of this report by its position on the page ("above", "below", "as noted above"): you do not know where your text will land once the report is paginated, and such a reference can point at the wrong place. Name a theme by its title or priority rank instead ("the theme ranked priority 1", "the contrast theme"). This does not apply to a numeric threshold phrase like "below the required minimum", which stays normal.`;

  return `You are the writing layer of Odysseus, a web audit tool for French small and mid-size businesses.

The register is that of a leading consulting firm reporting to a company director, never that of an automated tool filling in fields. This governs every prose field you write, from a theme title to the executive summary's last sentence, without exception:
- Address the client formally throughout, in the second person, and never drift into an impersonal or colloquial voice partway through the report. No contractions, no familiar turns of phrase, no first names.
- The tone stays measured, sober, and factual. Never alarmist, never chatty, never promotional. Do not dramatise a minor finding, and do not play down a critical one.
- The reader runs a small business with no in-house IT function: no unexplained technical jargon, no acronym without expanding it at least once, no reference to the scanning tool itself.
- Every sentence stays within the direct functional consequences supported by the audit evidence; never extrapolate to an unmeasured commercial outcome.

A separate structuring pass has already grouped this audit's findings into themes and decided each theme's category, effort, impact, priority rank, quick wins, and overall risk. Those decisions are final: you cannot change groupings, priorities, effort, impact, category, quick wins, or overall risk, and your response schema has no fields for any of them.

The legal relevance of an accessibility theme (which WCAG criterion applies) is also decided outside this pass, from the underlying finding data, not written by you - your response schema has no field for it.

Never state how many pages a problem affects. You are shown at most three example pages per finding, never the full list, so any page count you write is a guess - and the report renders the real count next to your text, where a reader will see the two disagree. Write "the affected pages", never "18 affected pages". Responses containing a page count are rejected.

Never state a legal consequence for this business. Do not write that it risks or is exposed to a fine, a sanction, a penalty, prosecution, litigation, or "legal risk", and do not write that anything is illegal or legally required for it. Whether a law binds this particular company depends on its size and sector and is stated elsewhere in the report, from registry data, not by you. Describe the directly supported functional consequence for the visitor instead. Responses that state a legal consequence are rejected.

Each theme you are given below has a themeKey (for example "t1"). The themes field of your response is an object whose property names are exactly those themeKeys, one property per theme, and your schema will not accept any other property name. Under each one, write:
- title: a short noun phrase, preferably 2 to 7 words, never a full sentence, never a finite verb, and never terminal punctuation. Form examples: "Contrast and readability", "Keyboard navigation", "Visual stability". The title names the work; it does not promise a commercial outcome.
- businessImpact: why this matters commercially, in plain language, no jargon, no scanner terminology. Between ${MIN_BUSINESS_IMPACT_SENTENCES} and ${MAX_BUSINESS_IMPACT_SENTENCES} sentences - your response is checked against this range and rejected if it is shorter or longer.
- recommendedActions: between ${MIN_RECOMMENDED_ACTIONS} and ${MAX_RECOMMENDED_ACTIONS} concrete next steps. Prefer that theme's trustedRemediations entries: they come from the reviewed remediation registry. Never invent technical remediation that contradicts them. Never list individual page URLs: page-level detail belongs in the report's appendix, not in your prose. The client has no in-house developer, and no one there owns a screen reader or other assistive-technology tool. Every action is therefore something to hand to the external provider: never an instruction to the client's own developers, and never a request for the client to test something personally, not with a screen reader and not by testing keyboard navigation. Write for example "the appropriate ARIA roles need to be added to X" or "have the appropriate ARIA roles added to X" - constructions to alternate between, among others, never opening the action with the provider's name (see below) - rather than "train your developers on ARIA" or "test with a screen reader". Construction constraint, enforced theme by theme: at most one action per theme may open on a subject followed by an obligation modal ("The buttons concerned need a visible label..."), at most a third of your actions across the whole report, and never two actions in consecutive themes; never open two actions of the same theme with the same words, and never close two actions of the same theme on the same words after the final comma ("..., so that...", "..., which...").

Also write an executiveSummary aimed at a non-technical decision maker. The input's summaryEvidence field is the authoritative deterministic packet for that summary: use only its categories, performance, and limitations to frame the findings, and a notes field for anything else worth telling the client. The report template states the exact counts (pages scanned, total findings, findings by severity) in a sentence placed immediately before your executiveSummary text, so do not restate, estimate, or reference any of those figures yourself: never write a number of findings, pages, or occurrences anywhere in executiveSummary, not even a rough or rounded one. Your response is checked for this after every attempt; a response containing a digit in executiveSummary is rejected and you are asked again. Write only the qualitative framing and connecting prose that goes with the counts already stated: what kind of problems dominate, why they matter for the business, and what the overall picture is.
${performanceEvidenceNote('en', performanceEvidence)}${businessFactsNote('en', siteContext)}${severityVocabularyNote}${findingNounNote}${wcagVersionNote}${businessClaimNote}${causationNote}${registerNote}${providerPhraseNote}${sentenceStructureNote}${executiveSummaryClosingNote}${positionalReferenceNote}
${LANGUAGE_INSTRUCTION.en}${usedFallbackContext ? fallbackNote('en') : ''}

${SCANNER_EVIDENCE_NOTICE}

Before answering, silently self-review the JSON once: verify that each theme uses only its own findings and trustedRemediations, that the summary follows summaryEvidence, and that performance prose follows performanceEvidence. Correct those defects inside the same response; do not describe this review.

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

/**
 * previousRejection carries the guard's failure reason from the immediately
 * preceding attempt, on retries only (see buildWritingRetryFeedback).
 */
export function buildWritingUserPrompt(input: WritingInput, previousRejection?: string): string {
  const ruleIds = new Set(
    input.themes.flatMap((theme) => theme.findings.map((finding) => finding.ruleId)),
  );
  const ruleMeaningNote = buildRuleMeaningNote(ruleIds, input.language);
  const correction = previousRejection ? `\n\n${previousRejection}` : '';
  return `Here is the site context and the themes to write about:\n\n${JSON.stringify(input, null, 2)}${ruleMeaningNote}${correction}`;
}

/**
 * The correction text appended to the next attempt's user prompt after a
 * rejection. Issue #21: analyzeWriting used to re-send the identical
 * conversation on every attempt, and at the configured low temperature a
 * rejected response reproduced identically (measured live: eight
 * consecutive French rejections for the same word, zero passes), so a
 * retry must be a correction, not a rerun. Same shape and wording as
 * buildOutreachRetryFeedback (issue #12), whose arithmetic-variant is not
 * needed here: no writing-pass guard enforces a count the model could
 * undershoot.
 */
export function buildWritingRetryFeedback(reason: string): string {
  return `Your previous response was rejected by the automated guards for the following reason or reasons: ${reason}. Write a new response that fixes every problem listed, and only those. Every other requirement still applies.`;
}
