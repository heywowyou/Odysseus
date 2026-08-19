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
 * not otherwise decode. English reports use Finding.title verbatim
 * (already English) and render no gloss - this table is fr-only.
 */
export interface RuleTranslation {
  label: string;
  gloss: string;
}

export const RULE_TRANSLATIONS_FR: Readonly<Record<string, RuleTranslation>> = {
  'alt-text-quality-heuristic': {
    label: "Texte alternatif vide sur une image qui n'est peut-être pas décorative",
    gloss: 'Signal heuristique sur la qualité des textes alternatifs, pas un test de conformité déterministe.',
  },
  'aria-required-children': {
    label: "Certains rôles ARIA doivent contenir des enfants spécifiques",
    gloss: "Un élément avec un rôle ARIA (ex. liste, menu) n'a pas la structure enfant que ce rôle exige.",
  },
  'bootup-time': {
    label: "Réduire le temps d'exécution JavaScript",
    gloss: 'Le navigateur passe trop de temps à exécuter du code JavaScript avant que la page soit utilisable.',
  },
  'broken-internal-link': {
    label: 'Un lien interne pointe vers une page en erreur',
    gloss: 'Un lien du site mène à une page qui ne charge pas correctement (erreur HTTP).',
  },
  'button-name': {
    label: 'Les boutons doivent avoir un texte identifiable',
    gloss: "Un bouton n'a pas de texte ou de libellé qu'un lecteur d'écran peut annoncer.",
  },
  'cache-insight': {
    label: 'Utiliser des durées de cache efficaces',
    gloss: 'Des fichiers statiques (images, scripts) sont retéléchargés inutilement faute de mise en cache.',
  },
  'cls-culprits-insight': {
    label: 'Éléments responsables des décalages de mise en page',
    gloss: 'Identifie les éléments précis à l\'origine de la stabilité visuelle insuffisante (CLS).',
  },
  'color-contrast': {
    label: 'Le contraste des couleurs est insuffisant',
    gloss: 'Le contraste entre le texte et son arrière-plan est en dessous du seuil minimal requis.',
  },
  'crawlable-anchors': {
    label: 'Des liens ne sont pas explorables',
    gloss: "Des liens ne sont pas des balises <a href> classiques, ce qui empêche les moteurs de recherche de les suivre.",
  },
  'cumulative-layout-shift': {
    label: 'Stabilité visuelle (CLS)',
    gloss: "Mesure les déplacements inattendus d'éléments pendant le chargement de la page.",
  },
  'document-latency-insight': {
    label: 'Latence de la requête du document',
    gloss: "Le temps que met le serveur à répondre à la toute première requête de la page.",
  },
  'dom-size': {
    label: 'Éviter une taille de DOM excessive',
    gloss: "La page contient un nombre d'éléments HTML trop élevé, ce qui ralentit le rendu.",
  },
  'entity-data-incomplete': {
    label: "Les données structurées de l'entité sont incomplètes",
    gloss: "Les informations d'identification de base de l'entreprise manquent dans les données structurées.",
  },
  'faq-content-without-schema': {
    label: 'Contenu de questions-réponses sans balisage structuré correspondant',
    gloss: "Une section FAQ n'utilise pas le balisage structuré (schema.org) qui la rendrait exploitable par les moteurs.",
  },
  'first-contentful-paint': {
    label: 'Premier affichage de contenu (FCP)',
    gloss: "Temps avant que le premier élément de contenu s'affiche à l'écran.",
  },
  'focus-order-mismatch': {
    label: "L'ordre de tabulation ne suit pas la structure de la page",
    gloss: 'La navigation au clavier saute des éléments dans un ordre illogique par rapport à la mise en page visuelle.',
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
    label: 'Garantir la visibilité du texte pendant le chargement des polices',
    gloss: 'Le texte peut être invisible pendant le chargement des polices personnalisées.',
  },
  'font-display-insight': {
    label: 'Affichage des polices',
    gloss: 'Le texte peut être invisible pendant le chargement des polices personnalisées.',
  },
  'forced-reflow-insight': {
    label: 'Recalcul de mise en page forcé',
    gloss: "Du code JavaScript force le navigateur à recalculer la mise en page de façon synchrone, ralentissant la page.",
  },
  'heading-hierarchy-skip': {
    label: 'Un niveau de titre est sauté dans la hiérarchie',
    gloss: 'Ex. un titre de niveau 2 (H2) est suivi directement par un titre de niveau 4 (H4), sans H3.',
  },
  'hreflang-no-return-link': {
    label: "Un lien hreflang n'a pas de lien retour",
    gloss: "Une page indique une version dans une autre langue, mais cette version ne renvoie pas vers la page d'origine.",
  },
  'html-has-lang': {
    label: "L'élément <html> doit avoir un attribut de langue",
    gloss: "La langue de la page n'est pas déclarée, ce qui perturbe les lecteurs d'écran et les moteurs de recherche.",
  },
  'image-alt': {
    label: "Les images doivent avoir un texte alternatif",
    gloss: "Une image n'a pas de texte alternatif du tout, invisible pour un lecteur d'écran.",
  },
  'image-delivery-insight': {
    label: 'Amélioration de la diffusion des images',
    gloss: 'Les images pourraient être compressées ou dimensionnées plus efficacement.',
  },
  'interactive': {
    label: "Délai avant interactivité",
    gloss: "Temps avant que la page réponde de façon fiable aux interactions de l'utilisateur.",
  },
  'is-crawlable': {
    label: "La page est bloquée pour l'indexation",
    gloss: 'Une directive technique empêche les moteurs de recherche d\'indexer cette page.',
  },
  'jsonld-invalid': {
    label: 'Les données structurées (JSON-LD) ne sont pas un JSON valide',
    gloss: 'Le balisage structuré de la page contient une erreur de syntaxe et ne peut pas être lu par les moteurs.',
  },
  'jsonld-missing': {
    label: 'Aucune donnée structurée (JSON-LD) trouvée',
    gloss: "La page n'a pas de balisage structuré, ce qui limite sa compréhension par les moteurs de recherche et d'IA.",
  },
  'label': {
    label: 'Les champs de formulaire doivent avoir un libellé',
    gloss: "Un champ de formulaire n'a pas de libellé identifiable par un lecteur d'écran.",
  },
  'largest-contentful-paint': {
    label: 'Affichage du plus grand contenu (LCP)',
    gloss: "Temps d'affichage du plus grand élément visible de la page, un indicateur de vitesse perçue.",
  },
  'largest-contentful-paint-element': {
    label: "Élément du plus grand affichage de contenu",
    gloss: "Identifie l'élément précis mesuré par le LCP.",
  },
  'layout-shifts': {
    label: 'Éviter les décalages de mise en page importants',
    gloss: "Des éléments se déplacent de façon inattendue pendant le chargement de la page.",
  },
  'lcen-mentions-legales-missing': {
    label: 'Aucun numéro SIREN, RCS ou de TVA trouvé sur le site',
    gloss: 'Obligation légale de mentions légales (LCEN) non respectée.',
  },
  'lcp-discovery-insight': {
    label: 'Découverte de la requête du LCP',
    gloss: "Le navigateur met du temps à découvrir la ressource qui deviendra l'élément le plus visible (LCP).",
  },
  'lcp-lazy-loaded': {
    label: "L'image du plus grand affichage de contenu est chargée en différé",
    gloss: 'L\'image la plus importante de la page est retardée par un chargement "lazy", ce qui la ralentit.',
  },
  'legacy-javascript': {
    label: 'Éviter de servir du JavaScript obsolète aux navigateurs modernes',
    gloss: "Du code ajouté pour compatibilité avec d'anciens navigateurs alourdit inutilement la page.",
  },
  'legacy-javascript-insight': {
    label: 'JavaScript obsolète',
    gloss: "Du code ajouté pour compatibilité avec d'anciens navigateurs alourdit inutilement la page.",
  },
  'link-in-text-block': {
    label: 'Les liens doivent être distinguables sans se fier uniquement à la couleur',
    gloss: 'Un lien au milieu dun paragraphe ne se distingue du texte que par sa couleur.',
  },
  'link-name': {
    label: 'Les liens doivent avoir un texte identifiable',
    gloss: "Un lien n'a pas de texte ou a un texte non descriptif (ex. « cliquez ici »).",
  },
  'mainthread-work-breakdown': {
    label: 'Réduire le travail du thread principal',
    gloss: 'Le navigateur passe trop de temps sur des tâches qui bloquent l\'interactivité de la page.',
  },
  'max-potential-fid': {
    label: 'Délai potentiel maximal de première interaction',
    gloss: "Estimation du pire délai de réponse possible à la première interaction de l'utilisateur.",
  },
  'meta-description': {
    label: 'Le document n\'a pas de méta-description',
    gloss: 'Le texte affiché sous le titre dans les résultats de recherche est absent.',
  },
  'meta-description-length': {
    label: 'La longueur de la méta-description est hors de la plage recommandée',
    gloss: 'Trop courte ou trop longue pour s\'afficher correctement dans les résultats de recherche.',
  },
  'meta-title-length': {
    label: 'La longueur du titre de page est hors de la plage recommandée',
    gloss: 'Trop court ou trop long pour s\'afficher correctement dans les résultats de recherche.',
  },
  'meta-viewport': {
    label: 'Le zoom et le redimensionnement ne doivent pas être désactivés',
    gloss: "La page empêche l'utilisateur de zoomer, ce qui gêne les personnes malvoyantes.",
  },
  'modern-http-insight': {
    label: 'Protocole HTTP moderne',
    gloss: 'Le serveur ne sert pas les ressources via une version récente du protocole HTTP.',
  },
  'modern-image-formats': {
    label: 'Servir les images dans des formats modernes',
    gloss: 'Les formats d\'image actuels (WebP, AVIF) réduisent le poids des pages par rapport au JPEG/PNG.',
  },
  'multiple-h1': {
    label: 'Plusieurs titres <h1> trouvés',
    gloss: 'La page a plus d\'un titre principal, ce qui brouille sa structure pour les moteurs et les lecteurs d\'écran.',
  },
  'nested-interactive': {
    label: 'Les contrôles interactifs ne doivent pas être imbriqués',
    gloss: 'Un élément interactif (bouton, lien) en contient un autre, ce qui perturbe la navigation au clavier.',
  },
  'network-dependency-tree-insight': {
    label: 'Arbre des dépendances réseau',
    gloss: "Chaîne de requêtes qui doivent se charger l'une après l'autre avant que la page soit prête.",
  },
  'no-h1': {
    label: 'Aucun titre <h1> trouvé',
    gloss: "La page n'a pas de titre principal, ce qui nuit à sa structure et à son référencement.",
  },
  'noindex-on-public-page': {
    label: 'Une page publique est exclue des résultats de recherche',
    gloss: 'Une directive technique (noindex) empêche cette page publique d\'apparaître dans les moteurs.',
  },
  'offscreen-images': {
    label: "Différer les images hors écran",
    gloss: "Des images non visibles au chargement retardent l'affichage du contenu utile.",
  },
  'prioritize-lcp-image': {
    label: "Précharger l'image du plus grand affichage de contenu",
    gloss: "L'image la plus importante de la page n'est pas chargée en priorité.",
  },
  'redirects': {
    label: 'Éviter les redirections multiples',
    gloss: 'Une page passe par plusieurs redirections avant d\'atteindre sa destination finale, ce qui la ralentit.',
  },
  'render-blocking-insight': {
    label: 'Requêtes bloquant le rendu',
    gloss: 'Des fichiers CSS ou JavaScript retardent l\'affichage de la page avant d\'être chargés.',
  },
  'render-blocking-resources': {
    label: 'Éliminer les ressources bloquant le rendu',
    gloss: 'Des fichiers CSS ou JavaScript retardent l\'affichage de la page avant d\'être chargés.',
  },
  'robots-txt': {
    label: 'Le fichier robots.txt n\'est pas valide',
    gloss: 'Le fichier qui indique aux moteurs de recherche quelles pages explorer contient une erreur.',
  },
  'select-name': {
    label: 'Les listes déroulantes doivent avoir un nom accessible',
    gloss: "Un champ de sélection (menu déroulant) n'a pas de nom identifiable par un lecteur d'écran.",
  },
  'server-response-time': {
    label: 'Réduire le temps de réponse initial du serveur',
    gloss: 'Le serveur met trop de temps à répondre à la première requête.',
  },
  'sitemap-orphan-page': {
    label: "Le sitemap liste des pages non atteignables depuis le site lui-même",
    gloss: "Une page du plan de site n'est reliée par aucun lien interne, ce qui complique sa découverte.",
  },
  'speed-index': {
    label: 'Indice de vitesse (Speed Index)',
    gloss: "Vitesse à laquelle le contenu visible d'une page se remplit pendant le chargement.",
  },
  'structured-data-entity-missing': {
    label: 'Aucune donnée structurée n\'identifie cette entreprise comme une entité',
    gloss: 'Absence de balisage identifiant clairement l\'entreprise pour les moteurs de recherche et d\'IA.',
  },
  'target-size': {
    label: "Toutes les cibles tactiles doivent faire au moins 24px, ou laisser un espace suffisant",
    gloss: 'Des boutons ou liens trop petits ou trop rapprochés sont difficiles à toucher sur mobile.',
  },
  'text-missing-from-raw-html': {
    label: "Contenu invisible pour un robot sans JavaScript",
    gloss: 'Du texte visible dans le navigateur est absent du HTML brut, invisible pour certains robots d\'indexation.',
  },
  'third-party-facades': {
    label: 'Certaines ressources tierces peuvent être chargées en différé avec une façade',
    gloss: 'Un widget tiers (vidéo, chat) pourrait afficher un aperçu léger avant de charger le script complet.',
  },
  'third-party-summary': {
    label: "Réduire l'impact du code tiers",
    gloss: 'Des scripts venant de services externes ralentissent la page.',
  },
  'total-blocking-time': {
    label: 'Temps de blocage total (TBT)',
    gloss: "Durée pendant laquelle la page ne répond pas aux interactions de l'utilisateur.",
  },
  'total-byte-weight': {
    label: 'Éviter les charges réseau énormes',
    gloss: "Le poids total des ressources téléchargées par la page est excessif.",
  },
  'unminified-css': {
    label: 'Minifier le CSS',
    gloss: "Les fichiers de style contiennent des espaces et commentaires inutiles qui alourdissent leur poids.",
  },
  'unminified-javascript': {
    label: 'Minifier le JavaScript',
    gloss: 'Les fichiers de script contiennent des espaces et commentaires inutiles qui alourdissent leur poids.',
  },
  'unsized-images': {
    label: "Les images n'ont pas de largeur/hauteur explicites",
    gloss: "L'absence de dimensions déclarées provoque des décalages de mise en page pendant le chargement.",
  },
  'unused-css-rules': {
    label: 'Réduire le CSS inutilisé',
    gloss: "Une partie des styles chargés ne sert à rien sur cette page.",
  },
  'unused-javascript': {
    label: 'Réduire le JavaScript inutilisé',
    gloss: "Une partie du code chargé ne sert à rien sur cette page.",
  },
  'uses-http2': {
    label: 'Utiliser HTTP/2',
    gloss: 'Le serveur sert les ressources via une version plus ancienne et moins efficace du protocole HTTP.',
  },
  'uses-long-cache-ttl': {
    label: 'Servir les ressources statiques avec une politique de cache efficace',
    gloss: 'Des fichiers qui changent rarement (images, scripts) sont retéléchargés à chaque visite.',
  },
  'uses-optimized-images': {
    label: 'Encoder les images efficacement',
    gloss: "Les images pourraient être compressées davantage sans perte visible de qualité.",
  },
  'uses-rel-preconnect': {
    label: 'Préconnecter aux origines nécessaires',
    gloss: "Le navigateur pourrait établir la connexion à des domaines tiers plus tôt.",
  },
  'uses-responsive-images': {
    label: 'Dimensionner les images correctement',
    gloss: "Des images plus grandes que nécessaire sont envoyées à l'appareil de l'utilisateur.",
  },
  'uses-text-compression': {
    label: 'Activer la compression du texte',
    gloss: 'Les fichiers texte (HTML, CSS, JS) sont transmis sans compression, ce qui alourdit leur poids.',
  },
  'video-missing-captions': {
    label: 'La vidéo n\'a pas de piste de sous-titres',
    gloss: "Une vidéo n'a pas de sous-titres, la rendant inaccessible aux personnes sourdes ou malentendantes.",
  },
  // item 1.3: not a real scanner ruleId - the synthetic family key
  // appendix-grouping.ts's RULE_FAMILIES assigns to 7 separate Lighthouse
  // rules ("your images are heavy" read as seven problems instead of
  // one). rule-translations.test.ts's coverage check iterates real
  // fixture ruleIds only, so this entry is not required by that
  // enforcement, but findings-appendix.ts looks it up the same way as
  // any other entry when rendering a clustered group's title.
  'image-weight': {
    label: 'Images trop lourdes ou mal optimisées',
    gloss: 'Plusieurs constats Lighthouse distincts (poids, format, dimensionnement, chargement) qui décrivent le même chantier de travail : optimiser les images du site.',
  },
};
