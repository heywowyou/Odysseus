import type { ReportLanguage } from '@odysseus/core';
import { BUSINESS_CLAIM_EXAMPLES } from './business-claim-guard.js';
import { selectProviderPhrase } from './provider-phrase-guard.js';
import { buildRuleMeaningNote } from './rule-meaning-notes.js';
import {
  BANNED_SEVERITY_SYNONYMS,
  FINDING_NOUN_VOCABULARY,
  SEVERITY_VOCABULARY,
} from './severity-vocabulary-guard.js';
import type { WritingInput } from './writing-schema.js';
import {
  MAX_BUSINESS_IMPACT_SENTENCES,
  MAX_RECOMMENDED_ACTIONS,
  MIN_BUSINESS_IMPACT_SENTENCES,
  MIN_RECOMMENDED_ACTIONS,
} from './writing-schema.js';
import { REQUIRED_WCAG_VERSION } from './wcag-citation-guard.js';

const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: "Rédigez title, businessImpact, chaque entrée de recommendedActions, executiveSummary et notes entièrement en français. Ne répondez pas en anglais. Votre réponse est vérifiée par un contrôle automatique de langue après chaque tentative : une réponse qui n'est pas en français sera rejetée et une nouvelle tentative vous sera demandée.",
  en: 'Write title, businessImpact, every entry in recommendedActions, executiveSummary, and notes entirely in English.',
};

const DOMINANT_METRIC_LABEL: Record<ReportLanguage, Record<'lcp' | 'cls' | 'tbt', string>> = {
  fr: {
    lcp: "Largest Contentful Paint (LCP), c'est-à-dire un affichage lent du contenu principal",
    cls: "Cumulative Layout Shift (CLS), c'est-à-dire une mise en page visuellement instable",
    tbt: "Total Blocking Time (TBT), c'est-à-dire un script JavaScript qui bloque le navigateur",
  },
  en: {
    lcp: 'Largest Contentful Paint (LCP), meaning slow-loading main content',
    cls: 'Cumulative Layout Shift (CLS), meaning unstable visual layout',
    tbt: 'Total Blocking Time (TBT), meaning JavaScript execution blocking the browser',
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

function dominantMetricNote(
  language: ReportLanguage,
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
): string {
  if (!dominantPerformanceMetric) return '';
  const label = DOMINANT_METRIC_LABEL[language][dominantPerformanceMetric];
  return language === 'fr'
    ? `\n\nLe problème de performance dominant sur ce site est ${label}. Pour tout thème de catégorie performance, recommendedActions doit d'abord traiter cette cause, avant tout conseil sur le poids des images, le CSS ou la mise en cache. Ne commencez pas par des conseils sur les images ou le CSS quand le véritable goulot d'étranglement est ailleurs.`
    : `\n\nThe dominant performance problem on this site is ${label}. For any performance-category theme, recommendedActions must address this cause first, before any advice about image weight, CSS, or caching. Do not lead with image or CSS advice when the actual bottleneck is something else.`;
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
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
  /** The phrase selectProviderPhrase assigned to this report. Omitted only
   *  by fixtures and offline tooling, which fall back to the first approved
   *  phrase for the language. */
  assignedPhrase?: string,
): string {
  return language === 'fr'
    ? buildFrenchWritingSystemPrompt(usedFallbackContext, dominantPerformanceMetric, assignedPhrase)
    : buildEnglishWritingSystemPrompt(
        usedFallbackContext,
        dominantPerformanceMetric,
        assignedPhrase,
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
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
  assignedPhrase?: string,
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

  const businessClaimNote = `\n\nVous ne disposez d'aucune donnée de revenu, de trafic ou de conversion, vous ne pouvez donc pas savoir quelle page compte le plus commercialement. N'affirmez jamais une telle chose comme un fait, par exemple n'écrivez jamais "${BUSINESS_CLAIM_EXAMPLES.fr}" ou toute superlativité similaire de rentabilité ou de revenu. Vous pouvez dire qu'une page semble commercialement importante et expliquer pourquoi, en utilisant un verbe de prudence ("semble", "paraît") dans cette même phrase - c'est une inférence que le client peut évaluer, pas une affirmation qu'il doit corriger. Une réponse contenant un superlatif de valeur commerciale non nuancé est rejetée.`;

  // item D8 (P4): a real report stated "causées par" for a correlation
  // measured on the same page, not a proven causal mechanism.
  const causationNote =
    '\n\nLe scanner rapporte ce qu\'il a mesuré directement : un constat, une métrique, une page. Il ne trace aucune chaîne de causalité entre eux. Quand deux éléments mesurés sur la même page semblent liés (par exemple des scripts bloquants et une métrique de chargement lente), décrivez-les comme liés ou associés, jamais comme l\'un causant l\'autre, sauf si la donnée du constat elle-même indique un mécanisme direct. Préférez "liées à" plutôt que "causées par" pour cela.';

  const providerPhraseNote = `\n\nLe client n'a pas d'équipe technique interne : les actions recommandées s'adressent donc à un prestataire externe. Désignez-le toujours par cette formulation exacte, et par aucune autre, dans toute la réponse et tous thèmes confondus : "${providerPhrase}". N'introduisez jamais une autre partie comme "votre agence" ou "vos développeurs", et n'employez aucune variante de la formulation imposée : un rapport où une priorité s'adresse à un interlocuteur et une autre à un second se lit comme deux interlocuteurs différents, pas un seul. Un contrôle automatique vérifie ce point après chaque tentative et rejette une réponse qui nomme le prestataire autrement.\n\nEmployez cette formulation dans chaque entrée de recommendedActions, de tous les thèmes, afin que le destinataire de chaque action soit toujours explicite. En revanche, ne commencez jamais une entrée de recommendedActions par cette formulation : ouvrez sur ce qui doit être corrigé, sur la conséquence, ou sur la page concernée, et ne nommez le prestataire qu'ensuite, à l'intérieur de la phrase ("Les boutons concernés doivent recevoir un libellé explicite, que ${providerPhrase} peut ajouter"). Une suite d'actions qui commencent toutes par le nom du prestataire, ou toutes par la même formule d'appel ("Demandez à..."), se lit comme un formulaire rempli et constitue un défaut à part entière.`;

  const sentenceStructureNote = `\n\nÉcrivez chaque champ de prose (title, businessImpact, chaque entrée de recommendedActions, executiveSummary, notes) sous forme de phrases complètes avec un sujet explicite, un verbe et un complément, et utilisez des virgules pour séparer les propositions plutôt que de laisser un fragment nominal télégraphique. Préférez "Le formulaire de réservation ne signale pas ses erreurs de saisie, si bien qu'un client qui se trompe de date ne comprend pas pourquoi sa demande échoue" à un fragment comme "Formulaire sans retour d'erreur, client perdu".\n\nVariez l'ouverture de vos phrases d'un thème à l'autre. C'est la consigne de rédaction la plus importante de ce prompt : un rapport dont tous les thèmes ouvrent sur la même construction se lit comme un formulaire rempli, pas comme l'analyse d'un professionnel, quelle que soit la qualité de chaque phrase prise isolément. Pour businessImpact, quatre ouvertures possibles, entre autres : sur le visiteur ("Un visiteur qui réserve depuis son téléphone..."), sur la page concernée ("La page de réservation..."), sur la conséquence directe ("Une partie des visiteurs abandonne avant..."), ou sur le constat lui-même reformulé en langage clair. Ne commencez pas systématiquement par "Ces constats" ou "Les constats". Pour recommendedActions, une action peut ouvrir sur ce qui doit être corrigé ("Le focus clavier doit suivre l'ordre visuel du formulaire..."), une autre sur la conséquence si rien n'est fait, une autre sur l'action elle-même. Ces amorces sont des structures à imiter, jamais des phrases à recopier. Deux thèmes qui se suivent ne doivent pas employer la même structure d'ouverture. Pour les actions, la contrainte porte dès le premier mot : n'ouvrez pas toutes vos actions sur le même verbe ni sur la même tournure ("Faites...", "Demandez...", "Ajoutez..."), même si la suite de la phrase diffère. Sur l'ensemble du rapport, vos actions doivent commencer par plusieurs premiers mots différents. Cette exigence de variété ne s'applique jamais au nom du prestataire : la formulation imposée plus haut est la seule chose du rapport qui ne doit pas varier, et la remplacer par une autre pour "varier" fait rejeter la réponse.`;

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
- Chaque phrase relie une observation à une conséquence concrète pour l'activité du client, et se tient à ce que l'audit a mesuré.

Une passe de structuration distincte a déjà regroupé les constats de cet audit en thèmes et décidé, pour chaque thème, sa catégorie, son effort, son impact, son rang de priorité, ses solutions rapides ("quick wins") et son risque global. Ces décisions sont définitives : vous ne pouvez pas modifier les regroupements, les priorités, l'effort, l'impact, la catégorie, les quick wins ni le risque global, et votre schéma de réponse ne comporte aucun champ pour cela.

La pertinence légale d'un thème d'accessibilité (quel critère WCAG s'applique) est également décidée en dehors de cette passe, à partir des données de constat sous-jacentes, pas rédigée par vous - votre schéma de réponse ne comporte aucun champ pour cela.

N'indiquez jamais combien de pages un problème affecte. On ne vous montre au maximum que trois pages d'exemple par constat, jamais la liste complète, donc tout nombre de pages que vous écririez serait une supposition - et le rapport affiche le vrai décompte juste à côté de votre texte, où un lecteur verra la différence. Écrivez "les pages concernées", jamais "les 18 pages concernées". Une réponse contenant un nombre de pages est rejetée.

N'énoncez jamais de conséquence légale pour cette entreprise. N'écrivez pas qu'elle risque ou qu'elle est exposée à une amende, une sanction, une pénalité, des poursuites, un contentieux ou un "risque juridique", et n'écrivez pas que quelque chose est illégal ou légalement obligatoire pour elle. Le fait qu'une loi s'applique à cette entreprise précise dépend de sa taille et de son secteur et est énoncé ailleurs dans le rapport, à partir de données de registre, pas par vous. Écrivez plutôt la conséquence commerciale : clients perdus, réservations manquées, confiance entamée. Une réponse énonçant une conséquence légale est rejetée.

Chaque thème qui vous est présenté ci-dessous a une clé themeKey (par exemple "t1"). Le champ themes de votre réponse est un objet dont les noms de propriété sont exactement ces themeKeys, une propriété par thème, et votre schéma n'acceptera aucun autre nom de propriété. Pour chacun, écrivez :
- title : un nom de thème court et en langage clair qui énonce le résultat utile ou la décision qu'il permet de prendre, pas seulement le sujet. Préférez "Corriger les contrastes pour rendre les textes lisibles" à une simple étiquette comme "Contrastes". N'énoncez que ce que les constats de ce thème soutiennent déjà : n'ajoutez ni chiffre, ni fait commercial, ni bénéfice chiffré, ni aucune autre affirmation que les données d'entrée ne contiennent pas. C'est de la prose rédigée par le modèle comme tout autre champ ci-dessous et elle est vérifiée par les mêmes règles ; une étiquette courte n'en dispense pas.
- businessImpact : pourquoi cela compte commercialement, en langage clair, sans jargon technique. Entre ${MIN_BUSINESS_IMPACT_SENTENCES} et ${MAX_BUSINESS_IMPACT_SENTENCES} phrases - votre réponse est vérifiée contre cette limite et rejetée si elle est trop courte ou trop longue.
- recommendedActions : entre ${MIN_RECOMMENDED_ACTIONS} et ${MAX_RECOMMENDED_ACTIONS} étapes concrètes suivantes. Ne listez jamais d'URL de page individuelle : le détail page par page appartient à l'annexe du rapport, pas à votre prose. Le client est une entreprise sans développeur interne, et personne chez lui ne dispose d'un lecteur d'écran ou d'un autre outil d'assistance technique. Chaque action est donc quelque chose à transmettre au prestataire externe : jamais une instruction aux développeurs du client, jamais une demande de test manuel par le client lui-même, ni avec un lecteur d'écran ni en testant la navigation au clavier. Écrivez par exemple "les rôles ARIA appropriés doivent être ajoutés à X" ou "${providerPhrase} peut ajouter les rôles ARIA appropriés à X" - deux constructions à alterner - plutôt que "formez vos développeurs à ARIA" ou "testez avec un lecteur d'écran".

Rédigez également un executiveSummary destiné à un décideur non technique, et un champ notes pour tout ce qui mérite d'être signalé au client par ailleurs. Le modèle de rapport indique déjà les décomptes exacts (pages auditées, nombre total de constats, constats par sévérité) dans une phrase placée juste avant votre texte d'executiveSummary, donc ne répétez, n'estimez ni ne référencez vous-même aucun de ces chiffres : n'écrivez jamais de nombre de constats, de pages ou d'occurrences nulle part dans executiveSummary, même approximatif ou arrondi. Votre réponse est vérifiée pour cela après chaque tentative ; une réponse contenant un chiffre dans executiveSummary est rejetée et une nouvelle tentative vous est demandée. N'écrivez que le cadrage qualitatif et la prose de liaison qui accompagne les décomptes déjà énoncés : quel type de problème domine, pourquoi cela compte pour l'activité, et quelle est l'image d'ensemble.
${dominantMetricNote('fr', dominantPerformanceMetric)}${severityVocabularyNote}${findingNounNote}${wcagVersionNote}${businessClaimNote}${causationNote}${providerPhraseNote}${sentenceStructureNote}${executiveSummaryClosingNote}${positionalReferenceNote}
${LANGUAGE_INSTRUCTION.fr}${usedFallbackContext ? fallbackNote('fr') : ''}

Répondez uniquement avec un JSON structuré conforme au schéma requis. Aucune prose en dehors des champs JSON, aucun bloc de code markdown.`;
}

function buildEnglishWritingSystemPrompt(
  usedFallbackContext: boolean,
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
  assignedPhrase?: string,
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

  const businessClaimNote = `\n\nYou are given no revenue, traffic, or conversion data, so you cannot know which page matters most commercially. Never assert one, for example never write "${BUSINESS_CLAIM_EXAMPLES.en}" or any similar profitability or revenue superlative, as a fact. You may say a page appears commercially important and explain why, using a hedged verb ("appears", "seems") in that same sentence - that is inference the client can weigh, not a claim they must correct. Responses containing an unhedged business-value superlative are rejected.`;

  // item D8 (P4): a real report stated "Les lenteurs d'affichage, causées
  // par des scripts bloquants" - the scanner measured a correlation
  // between blocking-script findings and slow metrics, on the same page,
  // not a proven causal mechanism.
  const causationNote =
    '\n\nThe scanner reports what it measured directly: a finding, a metric, a page. It does not trace causal chains between them. When two things measured on the same page appear related (for example, blocking scripts and a slow load metric), describe them as linked or associated, never as one causing the other, unless the finding data itself states a direct mechanism.';

  const providerPhraseNote = `\n\nAssume the client has no in-house developer, so the recommended actions are addressed to an external provider. Always name that provider with this exact wording and no other, throughout the response and across every theme: "${providerPhrase}". Never introduce another party such as "your agency" or "your developers", and never use a variant of the assigned wording: a report where one priority addresses one party and another addresses a second reads as two different parties, not one. An automated check verifies this after every attempt and rejects a response that names the provider any other way.\n\nUse that wording in every recommendedActions entry, across every theme, so the party each action is addressed to is always explicit. Never begin a recommendedActions entry with that wording, though: open on what needs fixing, on the consequence, or on the page concerned, and name the provider later inside the sentence ("The buttons concerned need a visible label, which ${providerPhrase} can add"). A run of actions that all start with the provider's name, or all start with the same request formula ("Ask..."), reads as a filled-in form and is a defect in its own right.`;

  // Client style rule, received verbatim in all caps ("TOUJOURS AVOIR DES
  // PHRASES AVEC VERBES SUJET COMPLEMENTS ET DES VIRGULES") and never
  // encoded in this prompt before. Without it the model's prose drifts
  // toward telegraph-style noun fragments.
  const sentenceStructureNote = `\n\nWrite every prose field (title, businessImpact, every entry in recommendedActions, executiveSummary, and notes) as complete sentences with an explicit subject, a verb, and a complement, and use commas to separate their clauses instead of leaving a terse noun-phrase fragment. Prefer "The reservation form does not flag its input errors, so a customer who enters the wrong date does not understand why the request failed" over a fragment like "No input error feedback, lost customer".\n\nVary how your sentences open from theme to theme. This is the most important writing instruction in this prompt: a report whose themes all open the same way reads as a filled-in form rather than a professional's analysis, however good each individual sentence is. For businessImpact, four possible openings among others: on the visitor ("A visitor booking from their phone..."), on the page concerned ("The reservation page..."), on the direct consequence ("Some visitors give up before..."), or on the finding itself restated in plain language. Do not begin every one with "These findings" or "This issue". For recommendedActions, one action can open on what needs fixing ("Keyboard focus needs to follow the form's visual order..."), another on the consequence of leaving it, another on the action itself. These openings are structures to imitate, never sentences to copy. Two consecutive themes must not use the same opening structure. For actions the constraint starts at the very first word: do not open every action on the same verb or turn of phrase ("Ask...", "Have...", "Add..."), even when the rest of the sentence differs. Across the report your actions must begin with several different first words. This variety requirement never applies to the provider's name: the wording assigned above is the one thing in the report that must not vary, and replacing it with another in the name of variety gets the response rejected.`;

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
- Every sentence ties an observation to a concrete consequence for the client's business, and stays within what the audit measured.

A separate structuring pass has already grouped this audit's findings into themes and decided each theme's category, effort, impact, priority rank, quick wins, and overall risk. Those decisions are final: you cannot change groupings, priorities, effort, impact, category, quick wins, or overall risk, and your response schema has no fields for any of them.

The legal relevance of an accessibility theme (which WCAG criterion applies) is also decided outside this pass, from the underlying finding data, not written by you - your response schema has no field for it.

Never state how many pages a problem affects. You are shown at most three example pages per finding, never the full list, so any page count you write is a guess - and the report renders the real count next to your text, where a reader will see the two disagree. Write "the affected pages", never "18 affected pages". Responses containing a page count are rejected.

Never state a legal consequence for this business. Do not write that it risks or is exposed to a fine, a sanction, a penalty, prosecution, litigation, or "legal risk", and do not write that anything is illegal or legally required for it. Whether a law binds this particular company depends on its size and sector and is stated elsewhere in the report, from registry data, not by you. Write the commercial consequence instead: lost customers, lost bookings, lost trust. Responses that state a legal consequence are rejected.

Each theme you are given below has a themeKey (for example "t1"). The themes field of your response is an object whose property names are exactly those themeKeys, one property per theme, and your schema will not accept any other property name. Under each one, write:
- title: a short, plain-language theme name that states the useful outcome or the decision it supports, not just the topic. Prefer "Fix contrast so text becomes readable" over a bare label like "Contrast". State only what the theme's findings already support: do not add a number, a business fact, a benefit figure, or any other claim the input data does not contain. It is model-written prose like every other field below and is checked by the same guards; a short label does not exempt it from any rule on this page.
- businessImpact: why this matters commercially, in plain language, no jargon, no scanner terminology. Between ${MIN_BUSINESS_IMPACT_SENTENCES} and ${MAX_BUSINESS_IMPACT_SENTENCES} sentences - your response is checked against this range and rejected if it is shorter or longer.
- recommendedActions: between ${MIN_RECOMMENDED_ACTIONS} and ${MAX_RECOMMENDED_ACTIONS} concrete next steps. Never list individual page URLs: page-level detail belongs in the report's appendix, not in your prose. The client has no in-house developer, and no one there owns a screen reader or other assistive-technology tool. Every action is therefore something to hand to the external provider: never an instruction to the client's own developers, and never a request for the client to test something personally, not with a screen reader and not by testing keyboard navigation. Write for example "the appropriate ARIA roles need to be added to X" or "${providerPhrase} can add the appropriate ARIA roles to X" - two constructions to alternate between - rather than "train your developers on ARIA" or "test with a screen reader".

Also write an executiveSummary aimed at a non-technical decision maker, and a notes field for anything else worth telling the client. The report template states the exact counts (pages scanned, total findings, findings by severity) in a sentence placed immediately before your executiveSummary text, so do not restate, estimate, or reference any of those figures yourself: never write a number of findings, pages, or occurrences anywhere in executiveSummary, not even a rough or rounded one. Your response is checked for this after every attempt; a response containing a digit in executiveSummary is rejected and you are asked again. Write only the qualitative framing and connecting prose that goes with the counts already stated: what kind of problems dominate, why they matter for the business, and what the overall picture is.
${dominantMetricNote('en', dominantPerformanceMetric)}${severityVocabularyNote}${findingNounNote}${wcagVersionNote}${businessClaimNote}${causationNote}${providerPhraseNote}${sentenceStructureNote}${executiveSummaryClosingNote}${positionalReferenceNote}
${LANGUAGE_INSTRUCTION.en}${usedFallbackContext ? fallbackNote('en') : ''}

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
  return `Your previous response was rejected by the automated guard: ${reason}. Write a new response that fixes exactly this problem. Every other requirement still applies.`;
}
