/**
 * Fixed remediation copy, one line per scanner rule id, French.
 *
 * Written and reviewed as content, never generated: this is the whole
 * substance of the "Reste a traiter" section, which exists because a real
 * report gave a client seven ranked priorities and left every other finding
 * as an annex row with no guidance at all
 * (2026-08 Palais Gallien review, retained in Git history, item 3.2).
 *
 * Code-owned for the same reason legalRelevance is (CLAUDE.md trade-off 8):
 * the model has no field for it and never writes a word of it. A remediation
 * instruction that is wrong is worse than none, so these are checked against
 * what the rule actually detects rather than paraphrased from its title.
 *
 * Scoped, like RULE_TRANSLATIONS_FR, to the rule ids this repo has actually
 * observed in real scanner output rather than the full universe of axe and
 * Lighthouse rules. remediation.test.ts asserts every rule id present in the
 * committed reference audits has an entry here and in en.ts, so a newly
 * observed rule fails the build instead of rendering with no guidance.
 *
 * One imperative sentence each. Where several rules describe one action over
 * a set of files, the copy says so, because that is exactly the distinction
 * the annex collapse (trade-off 30) is built on.
 */
export const REMEDIATION_FR: Readonly<Record<string, string>> = {
  'accessibility-statement-missing':
    "Bonne pratique facultative hors article 47 : envisagez de publier une déclaration d'accessibilité et d'ajouter un lien depuis le pied de page.",
  'alt-text-quality-heuristic':
    "Reprenez le texte alternatif de ces images pour qu'il décrive ce que chacune montre réellement. Ce point demande une relecture humaine, pas un correctif automatique.",
  'aria-command-name':
    "Donnez un nom lisible à chaque bouton ou lien porteur d'un rôle ARIA, avec du texte visible ou un attribut aria-label.",
  'aria-required-children':
    'Corrigez la structure ARIA : un rôle de type menu ou liste doit contenir directement les rôles enfants que la spécification attend.',
  'bootup-time':
    "Réduisez le temps d'exécution du JavaScript, en différant les scripts non essentiels au premier affichage.",
  'broken-internal-link':
    'Corrigez ou supprimez les liens internes qui ne mènent plus à une page existante.',
  'button-name':
    "Ajoutez du texte visible dans chaque bouton, ou un attribut aria-label lorsque le bouton n'affiche qu'une icône.",
  'cache-insight':
    'Allongez la durée de mise en cache des fichiers qui changent rarement (images, styles, scripts).',
  'canonical-missing':
    "Déclarez une URL canonique sur chaque page, pointant vers l'adresse que vous voulez voir indexée.",
  'canonical-target-noindex':
    "Faites pointer la balise canonique vers une page indexable, ou retirez l'exclusion sur la page ciblée. En l'état, les deux instructions se contredisent.",
  'canonical-target-unreachable':
    'Corrigez ou retirez la balise canonique : elle pointe vers une page que les moteurs de recherche ne peuvent pas atteindre, qui ne peut donc pas servir de version de référence.',
  'cls-culprits-insight':
    'Réservez la place des éléments qui arrivent après le premier affichage, pour que le contenu ne se déplace plus sous les yeux du visiteur.',
  'color-contrast':
    "Augmentez le contraste entre le texte et son fond jusqu'à au moins 4,5 pour 1, ou 3 pour 1 pour les grands caractères. Corrigez la règle de style, pas chaque élément.",
  'crawlable-anchors':
    "Rendez ces liens explorables : utilisez une balise a avec un attribut href, plutôt qu'un élément rendu cliquable par JavaScript.",
  'crux-inp-poor':
    "Réduisez le travail que le navigateur effectue au moment des clics et des saisies. Ces mesures viennent de vos visiteurs réels, pas d'une simulation.",
  'crux-lcp-poor':
    "Accélérez l'affichage du plus grand élément visible de la page, en général l'image principale. Ces mesures viennent de vos visiteurs réels.",
  'cumulative-layout-shift':
    'Stabilisez la mise en page pendant le chargement, en donnant des dimensions aux images et en réservant la place des bannières.',
  'document-latency-insight':
    'Réduisez le délai de réponse du serveur pour le document principal, avant même que le navigateur ne commence à afficher quoi que ce soit.',
  'document-title': 'Donnez à chaque page une balise title unique qui décrit son contenu.',
  'dom-size':
    "Allégez la structure de la page : un nombre d'éléments très élevé ralentit chaque calcul de mise en page.",
  'entity-data-incomplete':
    "Complétez les données structurées de l'établissement avec au minimum son nom, son adresse et son téléphone.",
  'faq-content-without-schema':
    'Ajoutez un balisage de données structurées de type FAQPage sur les pages qui présentent des questions et réponses.',
  'first-contentful-paint':
    'Accélérez le premier affichage : réduisez ce qui bloque le rendu et allégez la réponse du serveur.',
  'focus-order-mismatch':
    "Alignez l'ordre de tabulation sur l'ordre visuel de la page, en réorganisant le code plutôt qu'en forçant des valeurs de tabindex.",
  'font-display':
    'Ajoutez font-display: swap à vos polices, pour que le texte reste lisible pendant leur chargement.',
  'font-display-insight':
    'Ajoutez font-display: swap à vos polices, pour que le texte reste lisible pendant leur chargement.',
  'forced-reflow-insight':
    'Regroupez les lectures et les écritures de mise en page dans vos scripts, pour éviter de forcer le navigateur à tout recalculer plusieurs fois.',
  'form-error-not-associated':
    "Associez chaque message d'erreur de formulaire au champ concerné, avec aria-invalid=\"true\" et aria-describedby pointant vers le texte d'erreur, ou une zone role=\"alert\". Un changement d'apparence visuel seul n'est pas perçu par un lecteur d'écran.",
  'frame-title':
    "Ajoutez un attribut title à chaque iframe, décrivant ce qu'elle contient (par exemple une carte ou un module de réservation).",
  'heading-hierarchy-skip':
    "Reprenez la hiérarchie des titres pour qu'elle descende sans sauter de niveau. Choisissez le niveau selon la structure, pas selon la taille voulue.",
  'hreflang-missing':
    'Déclarez les annotations hreflang entre les versions linguistiques de chaque page, dans les deux sens.',
  'hreflang-no-return-link':
    'Ajoutez le lien hreflang de retour : chaque version linguistique doit déclarer toutes les autres, y compris elle-même.',
  'html-has-lang':
    "Ajoutez l'attribut lang sur la balise html de chaque page, avec le code de la langue réellement utilisée.",
  'html-structural-validity':
    'Corrigez le code HTML signalé : identifiants dupliqués, balises fermées dans le désordre, éléments placés dans un parent qui ne les accepte pas.',
  'image-alt':
    "Ajoutez un attribut alt décrivant chaque image porteuse d'information. Pour une image purement décorative, laissez alt vide.",
  'image-delivery-insight':
    "Servez ces images dans un format moderne et à la taille réellement affichée. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  interactive:
    'Réduisez le temps avant que la page ne réponde aux clics, principalement en allégeant le JavaScript exécuté au chargement.',
  'is-crawlable':
    "Retirez le blocage d'indexation sur cette page si elle doit apparaître dans les résultats de recherche.",
  'jsonld-invalid':
    "Corrigez la syntaxe du bloc de données structurées : il n'est pas lisible en tant que JSON et est donc ignoré entièrement.",
  'jsonld-missing':
    "Ajoutez un bloc de données structurées JSON-LD décrivant l'établissement, pour que les moteurs et les assistants de recherche puissent le lire.",
  'keyboard-trap':
    'Donnez un moyen de sortir de cet élément au clavier, par exemple la touche Echap ou un bouton de fermeture accessible, plutôt que de bloquer la touche de tabulation qui doit continuer à faire avancer le focus.',
  label:
    "Associez une étiquette à chaque champ de formulaire, avec une balise label liée au champ. Un texte d'aide affiché dans le champ ne suffit pas.",
  'largest-contentful-paint':
    "Accélérez l'affichage du plus grand élément visible, en général l'image principale : préchargez-la et ne la chargez pas en différé.",
  'largest-contentful-paint-element':
    "Identifiez l'élément le plus lent à s'afficher et traitez-le en priorité : c'est lui qui détermine la mesure.",
  'layout-shifts':
    'Donnez des dimensions explicites aux images et réservez la place des éléments injectés après coup.',
  'lcen-mentions-legales-missing':
    "Publiez sur le site les informations d'identification de l'entreprise, dont le numéro SIREN ou RCS. Le critère exact et sa source figurent dans la section consacrée à l'exposition légale.",
  'inp-breakdown-insight':
    "Réduisez le délai entre le clic et la réponse visible de la page : allégez le code exécuté au moment de l'interaction et laissez le navigateur redessiner avant les traitements longs.",
  'lcp-breakdown-insight':
    "Raccourcissez les étapes qui précèdent l'affichage du plus grand élément de la page : temps de réponse du serveur, découverte de l'image, puis son chargement.",
  'lcp-discovery-insight':
    "Faites en sorte que le navigateur découvre l'image principale au plus tôt : déclarez-la dans le HTML plutôt que via un script.",
  'lcp-lazy-loaded':
    "Retirez le chargement différé sur l'image principale : elle est visible immédiatement et le différé la retarde.",
  'legacy-javascript':
    'Cessez de servir aux navigateurs récents le code de compatibilité destiné aux anciens : il est téléchargé et exécuté pour rien.',
  'legacy-javascript-insight':
    'Cessez de servir aux navigateurs récents le code de compatibilité destiné aux anciens : il est téléchargé et exécuté pour rien.',
  'link-in-text-block':
    'Distinguez les liens du texte environnant autrement que par la couleur seule, par exemple avec un soulignement.',
  'link-name':
    "Donnez un texte lisible à chaque lien. Pour un lien qui n'entoure qu'une image, il suffit souvent de décrire cette image dans son attribut alt.",
  'link-text':
    'Remplacez les libellés de liens génériques (cliquez ici, en savoir plus) par un texte qui décrit la destination.',
  'llms-txt-missing':
    "Publiez un fichier /llms.txt à la racine du site pour indiquer aux moteurs de réponse par IA ce qu'est le site et comment le référencer. Convention récente, pas encore un standard : une opportunité plutôt qu'un défaut.",
  'mainthread-work-breakdown':
    'Réduisez le travail effectué par le navigateur au chargement : moins de scripts, moins de recalculs de style.',
  'max-potential-fid':
    'Découpez les tâches JavaScript longues, pour que la page reste capable de répondre à un clic pendant son chargement.',
  'meta-description':
    "Ajoutez une meta description à chaque page : c'est le texte affiché sous le titre dans les résultats de recherche.",
  'meta-description-length':
    "Ajustez la longueur de la meta description pour qu'elle reste lisible entière dans les résultats de recherche, autour de 120 à 160 caractères.",
  'meta-title-length':
    "Ajustez la longueur du titre de la page pour qu'il ne soit pas tronqué dans les résultats de recherche, autour de 30 à 60 caractères.",
  'meta-viewport':
    'Retirez user-scalable=no et toute limite de maximum-scale de la balise viewport, pour que le zoom reste possible.',
  'modern-http-insight':
    'Activez une version récente du protocole HTTP sur votre hébergement, pour que les fichiers se chargent en parallèle.',
  'modern-image-formats':
    "Convertissez ces images dans un format moderne comme WebP ou AVIF. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  'multiple-h1':
    "Ne gardez qu'un seul titre de niveau 1 par page et passez les autres en niveau 2.",
  'nested-interactive':
    "Ne placez pas un contrôle cliquable à l'intérieur d'un autre. Sortez le bouton ou le lien imbriqué de son parent.",
  'network-dependency-tree-insight':
    "Raccourcissez les chaînes de requêtes en cascade : chaque niveau supplémentaire ajoute un aller-retour avant l'affichage.",
  'no-h1': 'Ajoutez un titre de niveau 1 décrivant le sujet de la page.',
  'noindex-on-public-page':
    "Retirez l'instruction d'exclusion sur cette page si elle doit apparaître dans les résultats de recherche.",
  'offscreen-images':
    "Chargez en différé les images situées hors de l'écran au premier affichage, en gardant l'image principale en chargement immédiat.",
  'opengraph-missing':
    "Ajoutez les balises Open Graph (titre, description, image) pour contrôler l'aperçu affiché lors d'un partage sur les réseaux sociaux.",
  'prioritize-lcp-image':
    "Préchargez l'image principale de la page, pour que le navigateur la demande sans attendre.",
  redirects:
    "Faites pointer les liens directement vers l'adresse finale, pour supprimer les redirections intermédiaires.",
  'reflow-horizontal-scroll':
    "Rendez la mise en page adaptable jusqu'à une largeur de 320 pixels, sans défilement horizontal.",
  'render-blocking-insight':
    'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
  'render-blocking-resources':
    'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
  'robots-disallow-broad':
    "Resserrez la règle du fichier robots.txt : telle qu'elle est écrite, elle bloque une part importante des pages du site.",
  'robots-txt':
    'Corrigez la syntaxe du fichier robots.txt : telle quelle, une partie de son contenu est ignorée.',
  'scrollable-region-focusable':
    'Ajoutez tabindex="0" sur les zones que l\'on peut faire défiler, pour qu\'elles soient atteignables au clavier.',
  'security-header-missing-csp':
    "Ajoutez un en-tête Content-Security-Policy pour limiter les scripts que le navigateur accepte d'exécuter sur vos pages.",
  'security-header-missing-hsts':
    "Ajoutez un en-tête Strict-Transport-Security pour que le navigateur n'utilise que la connexion chiffrée.",
  'security-header-missing-permissions-policy':
    'Ajoutez un en-tête Permissions-Policy pour déclarer quelles fonctions du navigateur (caméra, micro, géolocalisation) le site utilise.',
  'security-header-missing-referrer-policy':
    "Ajoutez un en-tête Referrer-Policy pour limiter l'adresse de la page que le navigateur transmet aux sites tiers.",
  'security-header-missing-x-frame-options':
    "Ajoutez un en-tête X-Frame-Options, ou la directive frame-ancestors équivalente, pour empêcher l'affichage du site dans le cadre d'un autre site.",
  'select-name':
    'Associez une étiquette visible à chaque liste déroulante, ou donnez-lui un attribut aria-label.',
  'server-response-time':
    'Réduisez le délai de première réponse du serveur, par la mise en cache côté serveur ou un hébergement plus rapide.',
  'sitemap-orphan-page':
    'Ajoutez un lien vers ces pages depuis la navigation du site, ou retirez-les du plan de site. Une page listée mais jamais liée est difficile à atteindre.',
  'sitemap-stale':
    "Regénérez le plan de site pour qu'il corresponde aux pages actuellement publiées.",
  'speed-index':
    "Accélérez le remplissage visuel de la page, en traitant d'abord ce qui bloque le rendu et le poids des images.",
  'structured-data-entity-missing':
    "Ajoutez des données structurées identifiant l'établissement (type, nom, adresse), pour que les assistants de recherche puissent le citer.",
  'structured-data-invalid':
    "Complétez les champs manquants des données structurées : en l'état, Google les lit mais n'en tire pas tout ce qu'il pourrait afficher.",
  'target-size':
    "Portez les zones cliquables à au moins 24 pixels de côté, ou espacez-les davantage. Il s'agit en général d'une seule règle de style à corriger sur un groupe de contrôles.",
  'text-missing-from-raw-html':
    "Faites en sorte que le contenu soit présent dans le HTML servi, sans attendre l'exécution du JavaScript, par un rendu côté serveur ou une prégénération des pages.",
  'third-party-data-transfer':
    "Passez en revue les prestataires tiers sollicités au chargement et retirez ceux qui ne sont pas nécessaires. Chacun reçoit l'adresse IP du visiteur.",
  'third-party-facades':
    "Remplacez les modules tiers lourds (vidéo, chat, carte) par une image cliquable qui ne les charge qu'à la demande.",
  'third-party-summary':
    'Passez en revue les scripts tiers chargés et retirez ceux qui ne sont plus utilisés.',
  'total-blocking-time':
    "Découpez les tâches JavaScript longues et différez ce qui n'est pas nécessaire au premier affichage.",
  'total-byte-weight':
    'Réduisez le poids total téléchargé par page, principalement en compressant les images et en supprimant le code inutilisé.',
  'tracker-request-before-consent':
    "Bloquez le chargement de ces trackers tant que le visiteur n'a pas donné son consentement. Une requête vers ces domaines transmet déjà son adresse IP et la page consultée, même sans dépôt de cookie.",
  'unminified-css':
    'Activez la minification des feuilles de style dans votre chaîne de publication.',
  'unminified-javascript':
    'Activez la minification du JavaScript dans votre chaîne de publication.',
  'unsized-images':
    'Ajoutez les attributs width et height sur les images, pour que le navigateur réserve leur place avant de les charger.',
  'unused-css-rules':
    "Supprimez ou découpez les feuilles de style dont la majeure partie n'est pas utilisée sur la page chargée.",
  'unused-javascript':
    "Supprimez ou découpez les scripts dont la majeure partie n'est pas utilisée sur la page chargée.",
  'uses-http2':
    "Activez HTTP/2 sur votre hébergement, pour que les fichiers se chargent en parallèle plutôt qu'à la suite.",
  'uses-long-cache-ttl':
    'Allongez la durée de mise en cache des fichiers statiques, pour que les visiteurs récurrents ne les retéléchargent pas.',
  'uses-optimized-images':
    "Recompressez ces images à une qualité adaptée au web. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  'uses-rel-preconnect':
    'Déclarez une préconnexion vers les domaines tiers sollicités tôt dans le chargement.',
  'uses-responsive-images':
    "Servez ces images aux dimensions réellement affichées, plutôt qu'en pleine résolution redimensionnée par le navigateur.",
  'uses-text-compression':
    'Activez la compression des réponses textuelles (gzip ou brotli) sur votre serveur.',
  'video-missing-captions':
    "Ajoutez une piste de sous-titres aux vidéos porteuses de parole ou d'information sonore.",
};
