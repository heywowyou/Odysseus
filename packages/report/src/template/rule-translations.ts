import type { ReportLanguage } from '@odysseus/core';
import { normalizeFrenchTypographyDeep } from './french-typography.js';
import { RULE_LABELS_EN } from './rule-labels-en.js';

/**
 * item 38 [REGRESSION]: automated-tool rule names ("Certain ARIA roles
 * must contain particular children," "Total Blocking Time",
 * "forced-reflow-insight") rendered in English inside a French-language
 * report. The v2 prototype (docs/report-v2-prototype-haaitza-fr.html)
 * translated every rule title and carried a short French gloss under the
 * machine-readable rule code; the shipped report dropped both, and this
 * table restores them.
 *
 * Scoped to every ruleId that appears in this repo's real fixture data
 * (artifacts/*\/*\/findings.json - haaitza.com, sas-fernande.fr, the
 * Palais Gallien scan) rather than the full universe of axe-core and
 * Lighthouse rule IDs, which is much larger and includes many rules
 * never actually observed. rule-translations.test.ts asserts every
 * ruleId in those real fixtures has an entry here, so a newly observed
 * rule without a translation fails the build rather than shipping in
 * English, per the doc's own acceptance check - the enforcement
 * mechanism is real, even though the covered set is bounded to what has
 * actually been seen rather than every rule that could theoretically
 * appear.
 *
 * `label` is the translated finding title (replaces Finding.title in a
 * French report). `gloss` is a short plain-language explanation shown
 * under the machine-readable rule code, for the cryptic "-insight"
 * Lighthouse audit codes and other jargon a non-technical reader would
 * not otherwise decode. English reports read their titles from
 * rule-labels-en.ts (issue #332) and render no gloss.
 */
export interface RuleTranslation {
  label: string;
  gloss: string;
}

/** Issue #323: these titles are the third French source in the document,
 *  alongside the strings files and model prose, and carried their own
 *  conventions ("24px", straight apostrophes). Normalised at the table so
 *  every consumer of resolveFindingDisplayLabel and the gloss gets the
 *  same typography. */
export const RULE_TRANSLATIONS_FR: Readonly<Record<string, RuleTranslation>> =
  normalizeFrenchTypographyDeep({
    // C3/C4/C5/C6/C7 (2026-08-24): the five detection additions from the
    // three-site review. Added with the rules themselves rather than after
    // a real report leaked English titles, which is how the milestone 8.6
    // rules got here (A5).
    'reflow-horizontal-scroll': {
      label: 'La page impose un défilement horizontal sur écran étroit',
      gloss:
        'À la largeur de 320 pixels prévue par le critère WCAG 1.4.10, le contenu déborde et oblige à faire défiler la page dans les deux sens.',
    },
    'accessibility-statement-missing': {
      label: "Aucune déclaration d'accessibilité n'a été trouvée",
      gloss:
        "Aucune des pages analysées ne publie de déclaration d'accessibilité, document distinct de la conformité technique mesurée par ailleurs.",
    },
    'nap-phone-mismatch': {
      label: 'Le numéro de téléphone des données structurées ne figure pas sur la page',
      gloss:
        'La version lisible par les machines et celle lue par le visiteur ne concordent pas, ce qui empêche généralement un assistant IA de répondre.',
    },
    'nap-postal-code-mismatch': {
      label: 'Le code postal des données structurées ne figure pas sur la page',
      gloss:
        "L'adresse déclarée aux moteurs et aux assistants IA diffère de celle affichée au visiteur.",
    },
    'third-party-data-transfer': {
      label: "La page d'accueil sollicite plusieurs prestataires tiers",
      gloss:
        "Chaque prestataire externe contacté au chargement reçoit l'adresse IP du visiteur et la page consultée. Il s'agit d'un inventaire, pas d'un jugement.",
    },
    'html-structural-validity': {
      label: "Le code HTML de la page n'est pas bien formé",
      gloss:
        "Des identifiants dupliqués ou des balises mal imbriquées font que navigateur, moteur de recherche et lecteur d'écran ne reconstruisent pas tout à fait le même document.",
    },
    // C1 (2026-08-24): cookie/consent detection. Wording states what was
    // observed on one load with no interaction, never that the client is in
    // breach - CLAUDE.md rule 6 governs this section the same way it
    // governs the accessibility one, even though cookie scope (unlike the
    // EAA reading) is not itself disputed.
    'cookie-non-essential-before-consent': {
      label: 'Des cookies non essentiels sont déposés avant tout consentement',
      gloss:
        "Des cookies de mesure d'audience ou de publicité sont écrits dès l'arrivée du visiteur, avant qu'il ait pu accepter quoi que ce soit.",
    },
    'tracker-request-before-consent': {
      label: 'Des traceurs tiers sont contactés avant tout consentement',
      gloss:
        "Des requêtes partent vers des prestataires de mesure ou de publicité dès l'ouverture de la page, ce qui leur transmet l'adresse IP du visiteur même sans cookie.",
    },
    'consent-mechanism-absent': {
      label: 'Aucun mécanisme de consentement reconnu',
      gloss:
        "Des composants de mesure ou de publicité sont actifs et aucune plateforme de consentement connue n'a été détectée sur la page.",
    },
    'youtube-tracking-embed': {
      label: 'Une vidéo YouTube utilise le domaine avec traceurs',
      gloss:
        'La vidéo est intégrée depuis youtube.com, qui dépose des cookies publicitaires au chargement ; youtube-nocookie.com sert la même vidéo sans ces cookies.',
    },
    // A5 (2026-08-24 three-site review): milestone 8.6's four detection
    // additions and three later rules shipped with no French entry, so a
    // real Palais Gallien report printed "No X-Frame-Options header" and
    // "No Content-Security-Policy header" as annex titles in a French
    // document. rule-translations.test.ts did not catch it because every
    // fixture it pins predates 8.6 - the guard was real, its inputs were
    // stale. New fixtures for the three 2026-08-22 scans are added
    // alongside these entries so the guard actually covers them.
    'security-header-missing-csp': {
      label: 'Politique de sécurité du contenu (CSP) absente',
      gloss:
        "Le site n'envoie pas d'en-tête Content-Security-Policy, qui limite les scripts autorisés à s'exécuter sur vos pages.",
    },
    'security-header-missing-hsts': {
      label: 'En-tête HSTS absent',
      gloss:
        "Le site n'impose pas le HTTPS aux navigateurs pour les visites suivantes, ce qui laisse une première connexion possible en clair.",
    },
    'security-header-missing-x-frame-options': {
      label: 'En-tête X-Frame-Options absent',
      gloss:
        "Sans cet en-tête, le site peut être affiché dans un cadre invisible sur un autre site pour tromper un visiteur sur ce qu'il clique.",
    },
    'security-header-missing-referrer-policy': {
      label: 'En-tête Referrer-Policy absent',
      gloss:
        "Le site ne limite pas l'adresse de la page d'origine transmise aux sites tiers lors d'un clic sortant.",
    },
    'security-header-missing-permissions-policy': {
      label: 'En-tête Permissions-Policy absent',
      gloss:
        "Le site ne restreint pas l'accès des composants tiers aux fonctions du navigateur (caméra, micro, géolocalisation).",
    },
    'structured-data-invalid': {
      label: 'Données structurées invalides',
      gloss:
        "Le balisage schema.org de la page contient des erreurs qui empêchent les moteurs de l'exploiter.",
    },
    'canonical-target-noindex': {
      label: "L'URL canonique déclarée pointe vers une page exclue de l'indexation",
      gloss:
        'La page désigne comme version de référence une page que les moteurs ont pour consigne de ne pas indexer.',
    },
    'crux-lcp-poor': {
      label: 'Chargement du contenu principal jugé insuffisant par les visiteurs réels',
      gloss:
        'Les données de terrain Chrome placent le LCP de ce site au-dessus du seuil « insuffisant » publié par Google.',
    },
    'crux-cls-poor': {
      label: 'Stabilité visuelle jugée insuffisante par les visiteurs réels',
      gloss:
        'Les données de terrain Chrome placent le CLS de ce site au-dessus du seuil « insuffisant » publié par Google.',
    },
    'crux-inp-poor': {
      label: 'Réactivité jugée insuffisante par les visiteurs réels',
      gloss:
        "Les données de terrain Chrome placent l'INP de ce site au-dessus du seuil « insuffisant » publié par Google.",
    },
    'link-text': {
      label: "Le texte des liens n'est pas descriptif",
      gloss:
        "Des liens utilisent un libellé générique (« cliquez ici », « en savoir plus ») qui n'indique pas leur destination.",
    },
    'scrollable-region-focusable': {
      label: 'Une zone défilante ne peut pas recevoir le focus clavier',
      gloss:
        'Un bloc à défilement ne peut pas être parcouru au clavier, ce qui en rend le contenu inatteignable sans souris.',
    },
    'alt-text-quality-heuristic': {
      label: 'Texte alternatif potentiellement peu utile',
      gloss:
        'Signal heuristique sur la qualité des textes alternatifs, pas un test de conformité déterministe.',
    },
    // P1.1 (2026-08-21 La Corniche feedback pass, regression): "ARIA
    // commands must have an accessible name" leaked into a French report.
    'aria-command-name': {
      label: 'Les commandes ARIA doivent avoir un nom accessible',
      gloss:
        "Un élément interactif avec un rôle ARIA de commande (bouton, lien, etc.) n'a pas de nom qu'un lecteur d'écran peut annoncer.",
    },
    'aria-required-children': {
      label: 'Certains rôles ARIA doivent contenir des enfants spécifiques',
      gloss:
        "Un élément avec un rôle ARIA (ex. liste, menu) n'a pas la structure enfant que ce rôle exige.",
    },
    'bootup-time': {
      label: "L'exécution du JavaScript prend trop de temps",
      gloss:
        'Le navigateur passe trop de temps à exécuter du code JavaScript avant que la page soit utilisable.',
    },
    'broken-internal-link': {
      label: 'Un lien interne pointe vers une page en erreur',
      gloss: 'Un lien du site mène à une page qui ne charge pas correctement (erreur HTTP).',
    },
    'button-name': {
      label: 'Les boutons doivent avoir un texte identifiable',
      gloss: "Un bouton n'a pas de texte ou de libellé qu'un lecteur d'écran peut annoncer.",
    },
    bypass: {
      label: 'Aucun moyen de sauter directement au contenu',
      gloss:
        "La page n'offre aucun raccourci (lien d'évitement, repères de structure, titre de niveau 1) permettant de passer le menu de navigation. Une personne qui navigue au clavier ou au lecteur d'écran doit donc retraverser tout le menu sur chaque page avant d'atteindre le contenu.",
    },
    'cache-insight': {
      label: 'Des ressources sont mises en cache trop peu de temps',
      gloss:
        'Des fichiers statiques (images, scripts) sont retéléchargés inutilement faute de mise en cache.',
    },
    'cls-culprits-insight': {
      label: 'Des éléments font bouger la mise en page pendant le chargement',
      gloss:
        "Identifie les éléments précis à l'origine de la stabilité visuelle insuffisante (CLS).",
    },
    'color-contrast': {
      label: 'Le contraste des couleurs est insuffisant',
      gloss:
        'Le contraste entre le texte et son arrière-plan est en dessous du seuil minimal requis.',
    },
    'crawlable-anchors': {
      label: 'Des liens ne sont pas explorables',
      gloss:
        'Des liens ne sont pas des balises <a href> classiques, ce qui empêche les moteurs de recherche de les suivre.',
    },
    'cumulative-layout-shift': {
      label: 'La mise en page se décale pendant le chargement (CLS)',
      gloss: "Mesure les déplacements inattendus d'éléments pendant le chargement de la page.",
    },
    'document-latency-insight': {
      label: 'Le serveur met du temps à renvoyer la page',
      gloss: 'Le temps que met le serveur à répondre à la toute première requête de la page.',
    },
    'dom-size': {
      label: "La page contient un nombre excessif d'éléments",
      gloss: "La page contient un nombre d'éléments HTML trop élevé, ce qui ralentit le rendu.",
    },
    'entity-data-incomplete': {
      label: "Les données structurées de l'entité sont incomplètes",
      gloss:
        "Les informations d'identification de base de l'entreprise manquent dans les données structurées.",
    },
    'faq-content-without-schema': {
      label: 'Contenu de questions-réponses sans balisage structuré correspondant',
      gloss:
        "Une section FAQ n'utilise pas le balisage structuré (schema.org) qui la rendrait exploitable par les moteurs.",
    },
    'first-contentful-paint': {
      label: "Le premier contenu met du temps à s'afficher (FCP)",
      gloss: "Temps avant que le premier élément de contenu s'affiche à l'écran.",
    },
    'focus-order-mismatch': {
      label: "L'ordre de tabulation ne suit pas la structure de la page",
      gloss:
        'La navigation au clavier saute des éléments dans un ordre illogique par rapport à la mise en page visuelle.',
    },
    // item 2.3 [REGRESSION of report-feedback-haaitza.md item C7 for this
    // one rule]: rendered as the raw axe-core English title ("Frames must
    // have an accessible name") in the annex of a French report, while the
    // same rule appeared correctly translated as "Cadres sans titre
    // accessible" in the priorities section a few pages earlier - the two
    // sections read titles from different sources (this map here for the
    // annex, the writing pass's own theme title for priorities), so a rule
    // id missing from this map only ever surfaces in the annex.
    'frame-title': {
      label: 'Les cadres (iframe) doivent avoir un titre accessible',
      gloss: "Un iframe sans attribut title n'est pas identifiable par les lecteurs d'écran.",
    },
    'font-display': {
      label: 'Le texte reste invisible pendant le chargement des polices',
      gloss: 'Le texte peut être invisible pendant le chargement des polices personnalisées.',
    },
    'font-display-insight': {
      label: "Le chargement des polices retarde l'affichage du texte",
      gloss: 'Le texte peut être invisible pendant le chargement des polices personnalisées.',
    },
    'forced-reflow-insight': {
      label: 'Le JavaScript force des recalculs de mise en page',
      gloss:
        'Du code JavaScript force le navigateur à recalculer la mise en page de façon synchrone, ralentissant la page.',
    },
    'heading-hierarchy-skip': {
      label: 'Un niveau de titre est sauté dans la hiérarchie',
      gloss:
        'Ex. un titre de niveau 2 (H2) est suivi directement par un titre de niveau 4 (H4), sans H3.',
    },
    'hreflang-no-return-link': {
      label: "Un lien hreflang n'a pas de lien retour",
      gloss:
        "Une page indique une version dans une autre langue, mais cette version ne renvoie pas vers la page d'origine.",
    },
    'html-has-lang': {
      label: "L'élément <html> doit avoir un attribut de langue",
      gloss:
        "La langue de la page n'est pas déclarée, ce qui perturbe les lecteurs d'écran et les moteurs de recherche.",
    },
    'image-alt': {
      label: 'Les images doivent avoir un texte alternatif',
      gloss: "Une image n'a pas de texte alternatif du tout, invisible pour un lecteur d'écran.",
    },
    'image-delivery-insight': {
      label: 'Des images sont plus lourdes que nécessaire',
      gloss: 'Les images pourraient être compressées ou dimensionnées plus efficacement.',
    },
    interactive: {
      label: 'La page met du temps à devenir utilisable',
      gloss: "Temps avant que la page réponde de façon fiable aux interactions de l'utilisateur.",
    },
    'is-crawlable': {
      label: "La page est bloquée pour l'indexation",
      gloss: "Une directive technique empêche les moteurs de recherche d'indexer cette page.",
    },
    'jsonld-invalid': {
      label: 'Les données structurées (JSON-LD) ne sont pas un JSON valide',
      gloss:
        'Le balisage structuré de la page contient une erreur de syntaxe et ne peut pas être lu par les moteurs.',
    },
    'jsonld-missing': {
      label: 'Aucune donnée structurée (JSON-LD) trouvée',
      gloss:
        "La page n'a pas de balisage structuré, ce qui limite sa compréhension par les moteurs de recherche et d'IA.",
    },
    label: {
      label: 'Les champs de formulaire doivent avoir un libellé',
      gloss: "Un champ de formulaire n'a pas de libellé identifiable par un lecteur d'écran.",
    },
    'largest-contentful-paint': {
      label: "Le contenu principal met du temps à s'afficher (LCP)",
      gloss:
        "Temps d'affichage du plus grand élément visible de la page, un indicateur de vitesse perçue.",
    },
    'largest-contentful-paint-element': {
      label: "Le plus grand élément visible fixe le temps d'affichage (LCP)",
      gloss: "Identifie l'élément précis mesuré par le LCP.",
    },
    'layout-shifts': {
      label: 'Des décalages de mise en page importants se produisent',
      gloss: 'Des éléments se déplacent de façon inattendue pendant le chargement de la page.',
    },
    'lcen-mentions-legales-missing': {
      label: 'Aucun numéro SIREN, RCS ou de TVA trouvé sur le site',
      gloss:
        "Aucun identifiant SIREN, RCS ou TVA n'a été trouvé sur les pages visitées (LCEN, article 1-1, I, 2°).",
    },
    'lcp-discovery-insight': {
      label: "L'image principale est découverte tardivement par le navigateur",
      gloss:
        "Le navigateur met du temps à découvrir la ressource qui deviendra l'élément le plus visible (LCP).",
    },
    'lcp-lazy-loaded': {
      label: "L'image du plus grand affichage de contenu est chargée en différé",
      gloss:
        'L\'image la plus importante de la page est retardée par un chargement "lazy", ce qui la ralentit.',
    },
    'legacy-javascript': {
      label: 'Du JavaScript obsolète est envoyé aux navigateurs modernes',
      gloss:
        "Du code ajouté pour compatibilité avec d'anciens navigateurs alourdit inutilement la page.",
    },
    'legacy-javascript-insight': {
      label: 'Du JavaScript obsolète est envoyé aux navigateurs modernes',
      gloss:
        "Du code ajouté pour compatibilité avec d'anciens navigateurs alourdit inutilement la page.",
    },
    'link-in-text-block': {
      label: 'Les liens doivent être distinguables sans se fier uniquement à la couleur',
      gloss: 'Un lien au milieu dun paragraphe ne se distingue du texte que par sa couleur.',
    },
    'link-name': {
      label: 'Les liens doivent avoir un texte identifiable',
      gloss: "Un lien n'a pas de texte ou a un texte non descriptif (ex. « cliquez ici »).",
    },
    'mainthread-work-breakdown': {
      label: 'Le navigateur est trop occupé pour répondre rapidement',
      gloss:
        "Le navigateur passe trop de temps sur des tâches qui bloquent l'interactivité de la page.",
    },
    'max-potential-fid': {
      label: "La première interaction peut attendre longtemps avant d'être traitée",
      gloss:
        "Estimation du pire délai de réponse possible à la première interaction de l'utilisateur.",
    },
    'meta-description': {
      label: "Le document n'a pas de méta-description",
      gloss: 'Le texte affiché sous le titre dans les résultats de recherche est absent.',
    },
    'meta-description-length': {
      label: 'La longueur de la méta-description est hors de la plage recommandée',
      gloss:
        "Trop courte ou trop longue pour s'afficher correctement dans les résultats de recherche.",
    },
    'meta-title-length': {
      label: 'La longueur du titre de page est hors de la plage recommandée',
      gloss:
        "Trop court ou trop long pour s'afficher correctement dans les résultats de recherche.",
    },
    'meta-viewport': {
      label: 'Le zoom et le redimensionnement ne doivent pas être désactivés',
      gloss: "La page empêche l'utilisateur de zoomer, ce qui gêne les personnes malvoyantes.",
    },
    'modern-http-insight': {
      label: 'Des ressources sont servies avec un protocole HTTP ancien',
      gloss: 'Le serveur ne sert pas les ressources via une version récente du protocole HTTP.',
    },
    'modern-image-formats': {
      label: 'Des images ne sont pas servies dans un format moderne',
      gloss:
        "Les formats d'image actuels (WebP, AVIF) réduisent le poids des pages par rapport au JPEG/PNG.",
    },
    'multiple-h1': {
      label: 'Plusieurs titres <h1> trouvés',
      gloss:
        "La page a plus d'un titre principal, ce qui brouille sa structure pour les moteurs et les lecteurs d'écran.",
    },
    'nested-interactive': {
      label: 'Les contrôles interactifs ne doivent pas être imbriqués',
      gloss:
        'Un élément interactif (bouton, lien) en contient un autre, ce qui perturbe la navigation au clavier.',
    },
    'network-dependency-tree-insight': {
      label: 'Des chaînes de requêtes retardent le chargement',
      gloss:
        "Chaîne de requêtes qui doivent se charger l'une après l'autre avant que la page soit prête.",
    },
    'no-h1': {
      label: 'Aucun titre <h1> trouvé',
      gloss:
        "La page n'a pas de titre principal, ce qui nuit à sa structure et à son référencement.",
    },
    'noindex-on-public-page': {
      label: 'Une page publique est exclue des résultats de recherche',
      gloss:
        "Une directive technique (noindex) empêche cette page publique d'apparaître dans les moteurs.",
    },
    'offscreen-images': {
      label: 'Des images hors écran sont chargées immédiatement',
      gloss: "Des images non visibles au chargement retardent l'affichage du contenu utile.",
    },
    // P1.1 (2026-08-21 La Corniche feedback pass, regression): "No Open
    // Graph tags found" leaked into a French report.
    'opengraph-missing': {
      label: 'Aucune balise Open Graph détectée',
      gloss:
        "Les balises Open Graph (og:title, og:image, etc.) contrôlent l'aperçu de la page quand elle est partagée sur les réseaux sociaux ; aucune n'a été trouvée.",
    },
    'prioritize-lcp-image': {
      label: "L'image principale n'est pas préchargée",
      gloss: "L'image la plus importante de la page n'est pas chargée en priorité.",
    },
    redirects: {
      label: 'La page passe par plusieurs redirections',
      gloss:
        "Une page passe par plusieurs redirections avant d'atteindre sa destination finale, ce qui la ralentit.",
    },
    'render-blocking-insight': {
      label: 'Des ressources bloquent le premier affichage',
      gloss:
        "Des fichiers CSS ou JavaScript retardent l'affichage de la page avant d'être chargés.",
    },
    'render-blocking-resources': {
      label: 'Des ressources bloquent le premier affichage',
      gloss:
        "Des fichiers CSS ou JavaScript retardent l'affichage de la page avant d'être chargés.",
    },
    'robots-txt': {
      label: "Le fichier robots.txt n'est pas valide",
      gloss:
        'Le fichier qui indique aux moteurs de recherche quelles pages explorer contient une erreur.',
    },
    'select-name': {
      label: 'Les listes déroulantes doivent avoir un nom accessible',
      gloss:
        "Un champ de sélection (menu déroulant) n'a pas de nom identifiable par un lecteur d'écran.",
    },
    'server-response-time': {
      label: 'Le serveur répond lentement',
      gloss: 'Le serveur met trop de temps à répondre à la première requête.',
    },
    'sitemap-orphan-page': {
      label: 'Le sitemap liste des pages non atteignables depuis le site lui-même',
      gloss:
        "Une page du plan de site n'est reliée par aucun lien interne, ce qui complique sa découverte.",
    },
    'speed-index': {
      label: 'Le contenu visible se remplit lentement (Speed Index)',
      gloss: "Vitesse à laquelle le contenu visible d'une page se remplit pendant le chargement.",
    },
    'structured-data-entity-missing': {
      label: "Aucune donnée structurée n'identifie cette entreprise comme une entité",
      gloss:
        "Absence de balisage identifiant clairement l'entreprise pour les moteurs de recherche et d'IA.",
    },
    'target-size': {
      label:
        'Toutes les cibles tactiles doivent mesurer au moins 24 px, ou laisser un espace suffisant',
      gloss:
        'Des boutons ou liens trop petits ou trop rapprochés sont difficiles à toucher sur mobile.',
    },
    'text-missing-from-raw-html': {
      label: 'Contenu invisible pour un robot sans JavaScript',
      gloss:
        "Du texte visible dans le navigateur est absent du HTML brut, invisible pour certains robots d'indexation.",
    },
    'third-party-facades': {
      label: "Des contenus tiers sont chargés avant d'être utilisés",
      gloss:
        'Un widget tiers (vidéo, chat) pourrait afficher un aperçu léger avant de charger le script complet.',
    },
    'third-party-summary': {
      label: 'Le code tiers ralentit la page',
      gloss: 'Des scripts venant de services externes ralentissent la page.',
    },
    'total-blocking-time': {
      label: 'La page ne répond pas pendant de longues périodes (TBT)',
      gloss: "Durée pendant laquelle la page ne répond pas aux interactions de l'utilisateur.",
    },
    'total-byte-weight': {
      label: 'La page est trop lourde à télécharger',
      gloss: 'Le poids total des ressources téléchargées par la page est excessif.',
    },
    'unminified-css': {
      label: "Le CSS n'est pas minifié",
      gloss:
        'Les fichiers de style contiennent des espaces et commentaires inutiles qui alourdissent leur poids.',
    },
    'unminified-javascript': {
      label: "Le JavaScript n'est pas minifié",
      gloss:
        'Les fichiers de script contiennent des espaces et commentaires inutiles qui alourdissent leur poids.',
    },
    'unsized-images': {
      label: "Les images n'ont pas de largeur/hauteur explicites",
      gloss:
        "L'absence de dimensions déclarées provoque des décalages de mise en page pendant le chargement.",
    },
    'unused-css-rules': {
      label: 'Du CSS inutilisé est téléchargé',
      gloss: 'Une partie des styles chargés ne sert à rien sur cette page.',
    },
    'unused-javascript': {
      label: 'Du JavaScript inutilisé est téléchargé',
      gloss: 'Une partie du code chargé ne sert à rien sur cette page.',
    },
    'uses-http2': {
      label: 'Des ressources ne sont pas servies en HTTP/2',
      gloss:
        'Le serveur sert les ressources via une version plus ancienne et moins efficace du protocole HTTP.',
    },
    'uses-long-cache-ttl': {
      label: 'Des ressources statiques sont mises en cache trop peu de temps',
      gloss:
        'Des fichiers qui changent rarement (images, scripts) sont retéléchargés à chaque visite.',
    },
    'uses-optimized-images': {
      label: 'Des images ne sont pas compressées efficacement',
      gloss: 'Les images pourraient être compressées davantage sans perte visible de qualité.',
    },
    'uses-rel-preconnect': {
      label: 'Les connexions aux domaines nécessaires ne sont pas anticipées',
      gloss: 'Le navigateur pourrait établir la connexion à des domaines tiers plus tôt.',
    },
    'uses-responsive-images': {
      label: "Des images sont plus grandes que leur taille d'affichage",
      gloss: "Des images plus grandes que nécessaire sont envoyées à l'appareil de l'utilisateur.",
    },
    'uses-text-compression': {
      label: 'Les fichiers texte ne sont pas compressés',
      gloss:
        'Les fichiers texte (HTML, CSS, JS) sont transmis sans compression, ce qui alourdit leur poids.',
    },
    'video-missing-captions': {
      label: "La vidéo n'a pas de piste de sous-titres",
      gloss:
        "Une vidéo n'a pas de sous-titres, la rendant inaccessible aux personnes sourdes ou malentendantes.",
    },
    // Pre-emptive coverage pass (2026-08-24). Until now this table was filled
    // reactively: a rule got a French label only after some committed scan
    // emitted it, which meant four separate occasions where English reached a
    // real client-facing French report (item 38, item 2.3, P1.1, and
    // document-title/sitemap-stale/hreflang-missing in the Domaine Lagnonu
    // report). Operator decision: translate the whole reachable set instead of
    // waiting for the next leak.
    //
    // "Reachable" is computed, not guessed. axe is run with WCAG22AA_TAGS
    // (axe.ts), which narrows axe-core 4.12.1's 105 rules to the 70 that can
    // actually fire; Lighthouse contributes its performance and seo audits
    // minus LIGHTHOUSE_EXCLUDED_AUDITS and its informative-only audits. The 76
    // entries below are exactly the members of that set that had no French
    // label. rule-translations.test.ts asserts the custom-rule half of the
    // same property from source rather than from fixtures.
    // --- axe-core rules reachable under WCAG22AA_TAGS ---
    'area-alt': {
      label: "Zone cliquable d'image sans texte alternatif",
      gloss:
        "Une zone cliquable définie sur une image n'a pas de description textuelle, donc un lecteur d'écran ne peut pas annoncer où elle mène.",
    },
    'aria-allowed-attr': {
      label: 'Attribut ARIA non autorisé pour ce rôle',
      gloss:
        "Un attribut ARIA est utilisé sur un élément dont le rôle ne l'accepte pas ; les technologies d'assistance peuvent alors l'ignorer ou mal l'interpréter.",
    },
    'aria-braille-equivalent': {
      label: 'Étiquette braille sans équivalent texte',
      gloss:
        "Une étiquette destinée aux afficheurs braille n'a pas d'équivalent en texte, ce qui la rend inutilisable par les autres technologies d'assistance.",
    },
    'aria-conditional-attr': {
      label: 'Attribut ARIA utilisé hors des conditions prévues',
      gloss:
        "Un attribut ARIA n'est valide que dans certaines situations pour ce rôle, et il est utilisé en dehors de celles-ci.",
    },
    'aria-deprecated-role': {
      label: 'Rôle ARIA obsolète',
      gloss:
        "Ce rôle ARIA n'est plus recommandé et son comportement n'est plus garanti dans les technologies d'assistance.",
    },
    'aria-hidden-body': {
      label: "Le corps de la page est masqué aux technologies d'assistance",
      gloss:
        "L'attribut aria-hidden est posé sur tout le contenu de la page, qui devient entièrement invisible pour un lecteur d'écran.",
    },
    'aria-hidden-focus': {
      label: 'Élément masqué mais toujours atteignable au clavier',
      gloss:
        "Un élément est masqué aux lecteurs d'écran tout en restant accessible au clavier : la personne y arrive sans qu'on lui annonce où elle est.",
    },
    'aria-input-field-name': {
      label: 'Champ de saisie ARIA sans nom accessible',
      gloss:
        "Un champ de saisie n'a pas de nom, donc un lecteur d'écran ne peut pas dire à quoi il sert.",
    },
    'aria-meter-name': {
      label: 'Indicateur de mesure sans nom accessible',
      gloss:
        "Un élément affichant une mesure n'a pas de nom, donc sa valeur est annoncée sans indiquer de quoi il s'agit.",
    },
    'aria-progressbar-name': {
      label: 'Barre de progression sans nom accessible',
      gloss:
        "Une barre de progression n'a pas de nom, donc un lecteur d'écran annonce un pourcentage sans dire de quoi.",
    },
    'aria-prohibited-attr': {
      label: 'Attribut ARIA interdit pour ce rôle',
      gloss:
        "Un attribut ARIA est explicitement interdit sur ce type d'élément et sera ignoré ou provoquera une annonce incorrecte.",
    },
    'aria-required-attr': {
      label: 'Attribut ARIA obligatoire manquant',
      gloss:
        "Un rôle ARIA exige certains attributs pour fonctionner ; l'un d'eux est absent, donc le composant est annoncé de façon incomplète.",
    },
    'aria-required-parent': {
      label: 'Élément ARIA hors de son conteneur obligatoire',
      gloss:
        "Ce rôle doit être placé dans un conteneur précis (par exemple une option dans une liste) ; hors de ce conteneur, la structure n'est pas comprise.",
    },
    'aria-roledescription': {
      label: 'Description de rôle sur un élément sans rôle',
      gloss:
        "Une description de rôle personnalisée est posée sur un élément qui n'a pas de rôle, donc elle ne sera pas annoncée.",
    },
    'aria-roles': {
      label: 'Valeur de rôle ARIA invalide',
      gloss:
        "Le rôle indiqué n'existe pas dans la spécification ARIA, donc il est ignoré et l'élément est annoncé comme du texte ordinaire.",
    },
    'aria-tab-name': {
      label: 'Onglet sans nom accessible',
      gloss:
        "Un onglet n'a pas de nom, donc un lecteur d'écran ne peut pas dire vers quel contenu il mène.",
    },
    'aria-toggle-field-name': {
      label: 'Interrupteur ou case à cocher sans nom accessible',
      gloss:
        "Un contrôle à deux états n'a pas de nom, donc la personne entend son état sans savoir ce qu'il commande.",
    },
    'aria-tooltip-name': {
      label: 'Infobulle sans nom accessible',
      gloss:
        "Une infobulle n'a pas de contenu textuel accessible, donc son information n'est pas transmise aux lecteurs d'écran.",
    },
    'aria-valid-attr': {
      label: 'Attribut ARIA inexistant',
      gloss:
        "Un attribut commençant par aria- n'existe pas dans la spécification, en général une faute de frappe, et il est donc ignoré.",
    },
    'aria-valid-attr-value': {
      label: "Valeur d'attribut ARIA invalide",
      gloss:
        "Un attribut ARIA contient une valeur que la spécification n'autorise pas, souvent une référence vers un élément qui n'existe pas.",
    },
    'audio-caption': {
      label: 'Contenu audio sans transcription',
      gloss:
        "Un fichier audio n'a pas de transcription ni de sous-titres, donc son contenu est inaccessible aux personnes sourdes ou malentendantes.",
    },
    'autocomplete-valid': {
      label: 'Valeur de remplissage automatique incorrecte',
      gloss:
        "L'indication de remplissage automatique du champ n'est pas une valeur reconnue, donc le navigateur ne peut pas pré-remplir correctement.",
    },
    'avoid-inline-spacing': {
      label: 'Espacement du texte imposé en dur',
      gloss:
        "L'espacement des lettres ou des lignes est fixé directement sur l'élément, ce qui empêche une personne dyslexique d'appliquer son propre espacement.",
    },
    blink: {
      label: 'Texte clignotant',
      gloss:
        "Le contenu clignote, ce qui est interdit par les critères d'accessibilité et peut déclencher des troubles chez certaines personnes.",
    },
    'css-orientation-lock': {
      label: 'Contenu bloqué dans une seule orientation',
      gloss:
        "L'affichage est verrouillé en portrait ou en paysage, ce qui exclut les personnes dont l'appareil est fixé sur un support.",
    },
    'definition-list': {
      label: 'Liste de définitions mal structurée',
      gloss:
        "Une liste de définitions contient des éléments qui n'y ont pas leur place, donc sa structure n'est pas annoncée correctement.",
    },
    dlitem: {
      label: "Terme ou définition hors d'une liste de définitions",
      gloss:
        "Un terme ou sa définition se trouve hors du conteneur prévu, donc le lien entre les deux est perdu pour un lecteur d'écran.",
    },
    'duplicate-id-aria': {
      label: 'Identifiant utilisé deux fois',
      gloss:
        "Deux éléments portent le même identifiant alors qu'une étiquette ou un attribut ARIA y fait référence : la référence devient ambiguë.",
    },
    'form-field-multiple-labels': {
      label: 'Champ de formulaire avec plusieurs étiquettes',
      gloss:
        "Un champ a plusieurs étiquettes, et les lecteurs d'écran ne les annoncent pas toutes de la même façon, ce qui rend l'intitulé imprévisible.",
    },
    'frame-focusable-content': {
      label: "Cadre retiré de la navigation clavier alors qu'il contient des éléments interactifs",
      gloss:
        'Le cadre est exclu du parcours clavier mais contient des éléments sur lesquels on peut se placer, ce qui piège ou perd la navigation.',
    },
    'frame-title-unique': {
      label: 'Plusieurs cadres portent le même titre',
      gloss:
        "Deux cadres ont un titre identique, donc une personne utilisant un lecteur d'écran ne peut pas les distinguer.",
    },
    'html-lang-valid': {
      label: 'Code de langue de la page invalide',
      gloss:
        "La langue déclarée de la page n'est pas un code reconnu, donc la synthèse vocale peut lire le texte avec la mauvaise prononciation.",
    },
    'html-xml-lang-mismatch': {
      label: 'Deux déclarations de langue contradictoires',
      gloss:
        'La page déclare sa langue deux fois avec des valeurs différentes, donc la synthèse vocale peut choisir la mauvaise.',
    },
    'input-button-name': {
      label: 'Bouton de formulaire sans texte',
      gloss:
        "Un bouton n'a aucun intitulé, donc un lecteur d'écran annonce seulement qu'il y a un bouton, sans dire ce qu'il fait.",
    },
    'input-image-alt': {
      label: 'Bouton image sans texte alternatif',
      gloss:
        "Un bouton représenté par une image n'a pas de description, donc son rôle est invisible pour un lecteur d'écran.",
    },
    'label-content-name-mismatch': {
      label: 'Le nom accessible ne reprend pas le texte visible',
      gloss:
        "Le nom lu par un lecteur d'écran ne contient pas le texte affiché à l'écran, ce qui empêche la commande vocale de fonctionner sur le libellé visible.",
    },
    list: {
      label: 'Liste mal structurée',
      gloss:
        "Une liste contient des éléments qui ne sont pas des entrées de liste, donc son nombre d'éléments est annoncé de façon incorrecte.",
    },
    listitem: {
      label: "Entrée de liste hors d'une liste",
      gloss:
        "Un élément de liste n'est pas contenu dans une liste, donc il perd le contexte qui lui donne son sens.",
    },
    marquee: {
      label: 'Texte défilant',
      gloss:
        'Le contenu défile automatiquement, ce qui le rend illisible pour de nombreuses personnes et ne peut pas être arrêté.',
    },
    'meta-refresh': {
      label: 'Rechargement automatique de la page',
      gloss:
        "La page se recharge ou redirige toute seule après un délai, ce qui interrompt la lecture sans que la personne puisse l'empêcher.",
    },
    'no-autoplay-audio': {
      label: 'Son joué automatiquement',
      gloss:
        "Un son démarre seul et dure plus de trois secondes sans bouton d'arrêt, ce qui couvre la voix des lecteurs d'écran.",
    },
    'object-alt': {
      label: 'Contenu embarqué sans texte alternatif',
      gloss:
        "Un contenu embarqué n'a pas de description textuelle, donc son information est perdue pour un lecteur d'écran.",
    },
    'p-as-heading': {
      label: 'Paragraphe mis en forme comme un titre',
      gloss:
        "Du texte est grossi ou mis en gras pour ressembler à un titre sans en être un, donc il n'apparaît pas dans la liste des titres d'un lecteur d'écran.",
    },
    'role-img-alt': {
      label: 'Élément déclaré comme image sans texte alternatif',
      gloss:
        "Un élément joue le rôle d'une image mais n'a pas de description, donc son contenu n'est pas transmis.",
    },
    'server-side-image-map': {
      label: 'Image cliquable traitée côté serveur',
      gloss:
        "Ce type d'image cliquable ne peut pas être utilisé au clavier, donc ses liens sont inatteignables sans souris.",
    },
    'summary-name': {
      label: 'Résumé de bloc dépliable sans texte',
      gloss:
        "L'intitulé d'un bloc dépliable est vide, donc la personne ne sait pas ce qu'elle va ouvrir.",
    },
    'svg-img-alt': {
      label: 'Image vectorielle sans texte alternatif',
      gloss:
        "Une image vectorielle déclarée comme image n'a pas de description accessible, donc son contenu est perdu.",
    },
    'table-fake-caption': {
      label: "Titre de tableau simulé au lieu d'un vrai titre",
      gloss:
        "Le titre du tableau est une ligne ordinaire au lieu de l'élément prévu, donc il n'est pas rattaché au tableau.",
    },
    'td-has-header': {
      label: 'Cellule de tableau sans en-tête',
      gloss:
        "Une cellule d'un grand tableau n'est rattachée à aucun en-tête, donc sa valeur est annoncée sans indiquer de quelle colonne ou ligne elle vient.",
    },
    'td-headers-attr': {
      label: "Référence d'en-tête de tableau incorrecte",
      gloss:
        "Une cellule renvoie vers un en-tête qui n'existe pas ou qui n'est pas un en-tête, donc le rattachement échoue.",
    },
    'th-has-data-cells': {
      label: 'En-tête de tableau sans cellules associées',
      gloss:
        "Un en-tête ne décrit aucune cellule, en général le signe que le tableau sert à la mise en page plutôt qu'à des données.",
    },
    'valid-lang': {
      label: 'Code de langue invalide sur un passage de texte',
      gloss:
        'Un changement de langue signalé dans le texte utilise un code non reconnu, donc la prononciation ne changera pas.',
    },
    'video-caption': {
      label: 'Vidéo sans sous-titres',
      gloss:
        "Une vidéo n'a pas de sous-titres, donc son contenu parlé est inaccessible aux personnes sourdes ou malentendantes.",
    },
    // --- Lighthouse performance and seo audits that can emit findings ---
    'bf-cache': {
      label: 'Le retour arrière ne se fait pas instantanément',
      gloss:
        "La page ne peut pas être restaurée instantanément lors d'un retour arrière, ce qui oblige à la recharger entièrement.",
    },
    canonical: {
      label: 'Balise canonique invalide',
      gloss:
        "L'adresse de référence déclarée par la page n'est pas valide ou pointe au mauvais endroit, ce qui peut envoyer les signaux de référencement vers la mauvaise adresse.",
    },
    'dom-size-insight': {
      label: "La page contient un nombre excessif d'éléments",
      gloss:
        "La page contient un très grand nombre d'éléments, ce qui ralentit son affichage et sa réaction aux interactions.",
    },
    'duplicated-javascript': {
      label: 'Du code JavaScript est envoyé en double',
      gloss:
        'Le même code est présent plusieurs fois dans les fichiers téléchargés, ce qui alourdit inutilement la page.',
    },
    'duplicated-javascript-insight': {
      label: 'Du code JavaScript est envoyé en double',
      gloss:
        'Le même code est téléchargé plusieurs fois, ce qui gaspille de la bande passante et du temps de chargement.',
    },
    'efficient-animated-content': {
      label: 'Des animations utilisent un format inadapté',
      gloss:
        "Une animation est servie sous forme d'image animée alors qu'une vidéo serait bien plus légère.",
    },
    'first-meaningful-paint': {
      label: "Le contenu utile met du temps à s'afficher",
      gloss: "Mesure le moment où l'essentiel du contenu de la page devient visible.",
    },
    hreflang: {
      label: 'Annotation hreflang invalide',
      gloss:
        "Une annotation de langue déclarée par la page n'est pas valide, donc les moteurs de recherche ne peuvent pas relier les versions linguistiques.",
    },
    'http-status-code': {
      label: 'La page renvoie un code HTTP qui empêche son indexation',
      gloss:
        "Le serveur renvoie un code d'erreur pour cette page, donc les moteurs de recherche ne l'indexeront pas.",
    },
    'inp-breakdown-insight': {
      label: 'Des étapes ralentissent la réaction aux interactions',
      gloss:
        'Décompose le temps de réaction de la page pour montrer quelle étape retarde le plus la réponse à un clic.',
    },
    'interaction-to-next-paint': {
      label: 'La page réagit lentement aux interactions (INP)',
      gloss:
        "Le temps entre le clic d'un visiteur et la réaction visible de la page est trop long, ce qui donne une impression de lenteur.",
    },
    'lcp-breakdown-insight': {
      label: "Des étapes retardent l'affichage du contenu principal",
      gloss:
        'Décompose le temps mis pour afficher le plus grand élément de la page, afin de montrer quelle étape domine.',
    },
    'long-tasks': {
      label: 'De longs traitements bloquent la page',
      gloss:
        'Des calculs longs monopolisent le navigateur, pendant lesquels la page ne répond plus aux clics.',
    },
    'no-document-write': {
      label: "Un script écrit du contenu en bloquant l'affichage",
      gloss:
        "La page utilise une méthode d'insertion de contenu qui interrompt l'affichage, particulièrement pénalisante sur mobile.",
    },
    'non-composited-animations': {
      label: 'Des animations sont coûteuses à afficher',
      gloss:
        'Des animations obligent le navigateur à redessiner la page à chaque image, ce qui provoque des saccades.',
    },
    'structured-data': {
      label: 'Les données structurées doivent être vérifiées',
      gloss:
        'Les données structurées de la page doivent être validées avec un outil dédié ; Lighthouse ne les vérifie pas lui-même.',
    },
    'third-parties-insight': {
      label: 'Les services tiers alourdissent la page',
      gloss:
        "Des scripts extérieurs au site (mesure d'audience, widgets, publicité) occupent une part importante du temps de chargement.",
    },
    'uses-passive-event-listeners': {
      label: "Des écouteurs d'événements ralentissent le défilement",
      gloss:
        "Le code peut retarder le défilement de la page parce qu'il n'indique pas au navigateur qu'il ne le bloquera pas.",
    },
    'uses-responsive-images-snapshot': {
      label: "Des images ne sont pas adaptées à la taille de l'écran",
      gloss: 'Des images sont téléchargées dans une taille supérieure à celle réellement affichée.',
    },
    viewport: {
      label: "Déclaration d'affichage mobile absente ou incorrecte",
      gloss:
        "Sans cette déclaration, un téléphone affiche la page comme sur un écran d'ordinateur, en tout petit.",
    },
    'viewport-insight': {
      label: "L'affichage mobile n'est pas configuré de façon optimale",
      gloss:
        "La déclaration d'affichage mobile de la page n'est pas optimale, ce qui peut retarder la réaction au premier contact tactile.",
    },
    'work-during-interaction': {
      label: 'Des traitements ralentissent la réponse à une interaction',
      gloss: "Du travail effectué au moment d'un clic retarde la réponse visible pour le visiteur.",
    },
    // Domaine Lagnonu, 2026-08-24: the first audited site whose pages were
    // actually missing a <title>, so this axe rule had never appeared in any
    // committed fixture and leaked twice into a real French report (axe's own
    // row and Lighthouse's, which share this ruleId).
    'document-title': {
      label: "La page n'a pas de balise titre",
      gloss:
        "Le titre est le libellé affiché dans l'onglet du navigateur et lu en premier par un lecteur d'écran ; sans lui, la page est difficile à identifier parmi plusieurs onglets ou résultats de recherche.",
    },
    // Coverage sweep (2026-08-24, Domaine Lagnonu). The fixture-driven test
    // below can only see a ruleId some committed scan happened to emit, so
    // this table has been extended reactively four times after English
    // leaked into a real French report (item 38, item 2.3, P1.1, and
    // `hreflang-missing`/`sitemap-stale` in the Lagnonu report itself).
    // Comparing CUSTOM_CHECK_SEVERITY against this table found 20 custom
    // rules with a severity mapping and no French label. All 20 are entered
    // here, including the eight that currently have no emitter, so that
    // implementing an emitter later cannot reintroduce the leak.
    'robots-blocks-indexing': {
      label: "Le fichier robots.txt bloque la page d'accueil du site",
      gloss:
        "Le fichier robots.txt interdit aux moteurs de recherche de lire la page d'accueil, ce qui peut retirer le site des résultats de recherche.",
    },
    'robots-disallow-broad': {
      label: 'Une règle du fichier robots.txt bloque une grande partie du site',
      gloss:
        "Une seule règle d'interdiction couvre de nombreuses pages du site, qui deviennent invisibles pour les moteurs de recherche.",
    },
    'ai-crawler-blocked': {
      label: "Le fichier robots.txt bloque un robot d'intelligence artificielle",
      gloss:
        "Le site interdit l'accès à un robot d'assistant IA nommé, ce qui réduit les chances d'être cité dans ses réponses.",
    },
    'mixed-content': {
      label: 'La page charge des ressources non sécurisées',
      gloss:
        'Une page servie en HTTPS charge des fichiers en HTTP simple ; les navigateurs peuvent les bloquer ou afficher un avertissement de sécurité.',
    },
    'sitemap-missing': {
      label: 'Aucun fichier sitemap.xml trouvé',
      gloss:
        'Le sitemap est la liste des pages que le site déclare aux moteurs de recherche ; sans lui, la découverte des pages repose uniquement sur les liens internes.',
    },
    'sitemap-stale': {
      label: 'Le sitemap ne reflète pas le site actuel',
      gloss:
        "Le sitemap déclare des pages qui n'existent plus, ou omet des pages réelles ; les moteurs de recherche suivent alors une carte périmée du site.",
    },
    'llms-txt-missing': {
      label: 'Aucun fichier llms.txt trouvé',
      gloss:
        "Le fichier llms.txt résume le contenu du site à destination des assistants IA ; il est facultatif et encore récent, mais son absence prive le site d'un résumé qu'il contrôle lui-même.",
    },
    'hreflang-missing': {
      label: 'Aucune annotation hreflang sur un site multilingue',
      gloss:
        'Le site publie plusieurs versions linguistiques sans déclarer le lien entre elles ; les moteurs de recherche peuvent alors montrer la mauvaise langue à un visiteur, ou traiter les versions comme des doublons concurrents.',
    },
    'hreflang-invalid': {
      label: 'Annotation hreflang invalide',
      gloss:
        "Un code de langue ou de région déclaré dans une annotation hreflang n'est pas reconnu, ce qui rend l'annotation inexploitable.",
    },
    'canonical-conflicting': {
      label: 'Plusieurs balises canoniques contradictoires',
      gloss:
        'La page déclare plusieurs URL canoniques différentes ; les moteurs de recherche en choisissent une arbitrairement, ce qui peut envoyer les signaux de référencement vers la mauvaise adresse.',
    },
    'canonical-missing': {
      label: 'Balise canonique absente',
      gloss:
        'La page ne déclare pas son adresse de référence, ce qui peut faire traiter plusieurs adresses menant au même contenu comme des pages distinctes.',
    },
    'canonical-target-unreachable': {
      label: 'La balise canonique pointe vers une page inaccessible',
      gloss:
        "L'adresse de référence déclarée par la page ne répond pas, ce qui envoie les moteurs de recherche vers une page inexistante.",
    },
    'keyboard-trap': {
      label: 'Le focus clavier est bloqué sur un élément',
      gloss:
        "Un visiteur naviguant au clavier ne peut plus quitter cet élément, ce qui bloque la suite de la page pour toute personne n'utilisant pas de souris.",
    },
    'form-error-not-associated': {
      label: "Un message d'erreur de formulaire n'est signalé que visuellement",
      gloss:
        "L'erreur est affichée sans être rattachée au champ concerné, donc un lecteur d'écran ne l'annonce pas et la personne ne sait pas quoi corriger.",
    },
    'placeholder-only-label': {
      label: "Un champ de formulaire n'a pour libellé que son texte indicatif",
      gloss:
        'Le seul nom visible du champ est son texte indicatif, qui disparaît dès que la personne commence à écrire et reste souvent peu contrasté.',
    },
    'meta-title-missing': {
      label: 'Balise titre absente',
      gloss:
        "La page n'a pas de titre, qui est le libellé affiché dans l'onglet du navigateur et en tête du résultat de recherche.",
    },
    'meta-description-missing': {
      label: 'Méta description absente',
      gloss:
        'La page ne fournit pas de résumé court ; les moteurs de recherche en fabriquent alors un à partir du contenu, sans contrôle du site.',
    },
    'redirect-chain-excessive': {
      label: 'Chaîne de redirections trop longue',
      gloss:
        "L'adresse passe par plusieurs redirections successives avant d'arriver à destination, ce qui ralentit le chargement.",
    },
    'http-error-status': {
      label: 'La page renvoie une erreur HTTP',
      gloss: "Le serveur répond par un code d'erreur au lieu de la page attendue.",
    },
    'image-oversized': {
      label: 'Image servie dans une taille supérieure à son affichage',
      gloss:
        "L'image téléchargée est nettement plus grande que la zone où elle est affichée, ce qui gaspille de la bande passante.",
    },
    'image-legacy-format': {
      label: 'Image dans un format ancien',
      gloss:
        "L'image utilise un format plus lourd que les formats modernes équivalents, à qualité visuelle comparable.",
    },
  });

/** Plan 018 step 6: one shared display-label resolver for a finding's rule,
 *  extracted from the label logic the findings appendix used to inline, so
 *  the appendix and the deterministic priority evidence (rendered-priorities.ts)
 *  read the same table through the same function and cannot disagree about
 *  what a defect is called. Reviewed French rule label in a French report,
 *  reviewed English label (rule-labels-en.ts, issue #332) in an English one;
 *  the scanner's own title for a rule neither table knows yet; the rule id
 *  as the last resort when even the scanner title is missing. */
export function resolveFindingDisplayLabel(
  language: ReportLanguage,
  ruleId: string,
  scannerTitle: string | undefined,
): string {
  const reviewed = language === 'fr' ? RULE_TRANSLATIONS_FR[ruleId]?.label : RULE_LABELS_EN[ruleId];
  return reviewed ?? scannerTitle ?? ruleId;
}
