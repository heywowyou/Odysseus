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
  'ai-crawler-blocked':
    "Retirez du fichier robots.txt la règle qui interdit ce robot d'assistant IA, si vous souhaitez que le site puisse être cité dans ses réponses.",
  'alt-text-quality-heuristic':
    "Reprenez le texte alternatif de ces images pour qu'il décrive ce que chacune montre réellement. Ce point demande une relecture humaine, pas un correctif automatique.",
  'area-alt':
    "Ajoutez un attribut alt à chaque zone cliquable d'une image, décrivant la destination du lien.",
  'aria-allowed-attr':
    "Retirez l'attribut ARIA que le rôle de cet élément n'accepte pas, ou remplacez le rôle par celui qui correspond réellement au composant.",
  'aria-braille-equivalent':
    "Ajoutez l'étiquette texte correspondant à l'étiquette braille, ou retirez cette dernière si elle fait double emploi.",
  'aria-command-name':
    "Donnez un nom lisible à chaque bouton ou lien porteur d'un rôle ARIA, avec du texte visible ou un attribut aria-label.",
  'aria-conditional-attr':
    "Retirez cet attribut ARIA, ou placez l'élément dans la situation où la spécification l'autorise.",
  'aria-deprecated-role':
    "Remplacez ce rôle ARIA obsolète par le rôle actuel équivalent, ou par l'élément HTML natif qui joue le même rôle.",
  'aria-hidden-body':
    "Retirez l'attribut aria-hidden posé sur le corps de la page : en l'état, un lecteur d'écran ne voit aucun contenu.",
  'aria-hidden-focus':
    'Retirez du parcours clavier les éléments masqués aux lecteurs d\'écran, avec tabindex="-1", ou cessez de les masquer.',
  'aria-input-field-name':
    'Donnez un nom à ce champ de saisie, avec une étiquette visible reliée au champ ou un attribut aria-label.',
  'aria-meter-name':
    "Donnez un nom à cet indicateur de mesure, pour que sa valeur soit annoncée avec ce qu'elle mesure.",
  'aria-progressbar-name':
    "Donnez un nom à cette barre de progression, pour que le pourcentage annoncé indique de quoi il s'agit.",
  'aria-prohibited-attr':
    "Retirez cet attribut ARIA : il est interdit sur ce type d'élément et provoque une annonce incorrecte.",
  'aria-required-attr':
    'Ajoutez les attributs ARIA que ce rôle exige, sans lesquels le composant est annoncé de façon incomplète.',
  'aria-required-children':
    'Corrigez la structure ARIA : un rôle de type menu ou liste doit contenir directement les rôles enfants que la spécification attend.',
  'aria-required-parent':
    'Placez cet élément dans le conteneur que son rôle exige, par exemple une option dans une liste.',
  'aria-roledescription':
    'Donnez un rôle à cet élément, ou retirez la description de rôle : sans rôle, elle ne sera jamais annoncée.',
  'aria-roles':
    "Corrigez la valeur du rôle ARIA : celle indiquée n'existe pas dans la spécification, en général une faute de frappe.",
  'aria-tab-name': 'Donnez un nom à chaque onglet, décrivant le contenu vers lequel il mène.',
  'aria-toggle-field-name':
    "Donnez un nom à ce contrôle à deux états, pour que la personne sache ce qu'il commande.",
  'aria-tooltip-name':
    "Donnez un contenu textuel accessible à cette infobulle, sans quoi son information n'est pas transmise.",
  'aria-valid-attr':
    "Corrigez le nom de cet attribut ARIA : il n'existe pas dans la spécification et il est donc ignoré.",
  'aria-valid-attr-value':
    'Corrigez la valeur de cet attribut ARIA, souvent une référence vers un identifiant absent de la page.',
  'audio-caption':
    "Publiez une transcription texte du contenu audio, ou des sous-titres lorsqu'il accompagne une vidéo.",
  'autocomplete-valid':
    "Corrigez l'attribut autocomplete avec l'un des mots-clés reconnus, pour que le navigateur puisse pré-remplir le champ.",
  'avoid-inline-spacing':
    "Retirez l'espacement des lettres et des lignes fixé directement sur l'élément, et gérez-le dans la feuille de style.",
  'bf-cache':
    "Retirez ce qui empêche la restauration instantanée de la page lors d'un retour arrière, en général un en-tête no-store ou un écouteur d'événement unload.",
  blink: 'Supprimez le clignotement du contenu : aucun réglage ne rend cet effet conforme.',
  'bootup-time':
    "Réduisez le temps d'exécution du JavaScript, en différant les scripts non essentiels au premier affichage.",
  'broken-internal-link':
    'Corrigez ou supprimez les liens internes qui ne mènent plus à une page existante.',
  'button-name':
    "Ajoutez du texte visible dans chaque bouton, ou un attribut aria-label lorsque le bouton n'affiche qu'une icône.",
  bypass:
    "Ajoutez un lien d'évitement en tête de page, ou des repères de structure et un titre de niveau 1, pour permettre d'atteindre le contenu sans retraverser le menu.",
  'cache-insight':
    'Allongez la durée de mise en cache des fichiers qui changent rarement (images, styles, scripts).',
  canonical:
    'Corrigez la balise canonique : elle doit contenir une adresse absolue et valide, pointant vers la version de référence de la page.',
  'canonical-conflicting':
    "Ne déclarez qu'une seule URL canonique par page : tant que plusieurs se contredisent, les moteurs de recherche en retiennent une au hasard.",
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
  'consent-mechanism-absent':
    "Mettez en place un mécanisme de consentement sur le site, capable de bloquer les composants de mesure et de publicité tant que le visiteur n'a rien accepté.",
  'cookie-non-essential-before-consent':
    'Reportez le dépôt des cookies de mesure et de publicité après le choix du visiteur. Seuls les cookies nécessaires au fonctionnement du site peuvent être écrits avant.',
  'crawlable-anchors':
    "Rendez ces liens explorables : utilisez une balise a avec un attribut href, plutôt qu'un élément rendu cliquable par JavaScript.",
  'crux-cls-poor':
    "Stabilisez la mise en page pendant le chargement, en donnant des dimensions aux images et en réservant la place des bannières. Ces mesures viennent de vos visiteurs réels, pas d'une simulation.",
  'crux-inp-poor':
    "Réduisez le travail que le navigateur effectue au moment des clics et des saisies. Ces mesures viennent de vos visiteurs réels, pas d'une simulation.",
  'crux-lcp-poor':
    "Accélérez l'affichage du plus grand élément visible de la page, en général l'image principale. Ces mesures viennent de vos visiteurs réels.",
  'css-orientation-lock':
    "Laissez la page s'afficher en portrait comme en paysage, sans verrouiller l'orientation.",
  'cumulative-layout-shift':
    'Stabilisez la mise en page pendant le chargement, en donnant des dimensions aux images et en réservant la place des bannières.',
  'definition-list':
    'Ne placez dans une liste de définitions que des termes et leurs définitions, sans autre élément intercalé.',
  dlitem:
    'Placez chaque terme et sa définition dans une liste de définitions, pour que le lien entre les deux soit conservé.',
  'document-latency-insight':
    'Réduisez le délai de réponse du serveur pour le document principal, avant même que le navigateur ne commence à afficher quoi que ce soit.',
  'document-title': 'Donnez à chaque page une balise title unique qui décrit son contenu.',
  'dom-size':
    "Allégez la structure de la page : un nombre d'éléments très élevé ralentit chaque calcul de mise en page.",
  'dom-size-insight':
    "Allégez la structure de la page : un nombre d'éléments très élevé ralentit chaque calcul de mise en page.",
  'duplicate-id-aria':
    'Rendez cet identifiant unique dans la page : une étiquette ou un attribut ARIA y fait référence, et la référence devient ambiguë.',
  'duplicated-javascript-insight':
    'Supprimez le code JavaScript téléchargé en double, en général une bibliothèque incluse par plusieurs scripts.',
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
  'form-field-multiple-labels':
    "Ne gardez qu'une seule étiquette par champ de formulaire, en fusionnant les intitulés si nécessaire.",
  'frame-focusable-content':
    "Remettez ce cadre dans le parcours clavier, ou retirez les éléments interactifs qu'il contient.",
  'frame-title':
    "Ajoutez un attribut title à chaque iframe, décrivant ce qu'elle contient (par exemple une carte ou un module de réservation).",
  'frame-title-unique': 'Donnez un titre distinct à chaque cadre, décrivant son contenu propre.',
  'heading-hierarchy-skip':
    "Reprenez la hiérarchie des titres pour qu'elle descende sans sauter de niveau. Choisissez le niveau selon la structure, pas selon la taille voulue.",
  hreflang:
    'Corrigez les annotations hreflang de la page : chaque code de langue doit être valide et chaque adresse déclarée complète.',
  'hreflang-invalid':
    "Corrigez le code de langue ou de région de cette annotation hreflang : tel qu'il est écrit, il n'est pas reconnu et l'annotation est ignorée.",
  'hreflang-missing':
    'Déclarez les annotations hreflang entre les versions linguistiques de chaque page, dans les deux sens.',
  'hreflang-no-return-link':
    'Ajoutez le lien hreflang de retour : chaque version linguistique doit déclarer toutes les autres, y compris elle-même.',
  'html-has-lang':
    "Ajoutez l'attribut lang sur la balise html de chaque page, avec le code de la langue réellement utilisée.",
  'html-lang-valid':
    'Corrigez le code de langue de la page avec un code reconnu, par exemple fr ou en.',
  'html-structural-validity':
    'Corrigez le code HTML signalé : identifiants dupliqués, balises fermées dans le désordre, éléments placés dans un parent qui ne les accepte pas.',
  'html-xml-lang-mismatch':
    "Faites concorder les deux déclarations de langue de la page, ou n'en gardez qu'une.",
  'http-error-status':
    "Rétablissez cette page, ou faites-la rediriger vers l'adresse qui l'a remplacée, puis corrigez les liens qui pointent encore vers elle.",
  'http-status-code':
    'Rétablissez une réponse normale pour cette page : tant que le serveur renvoie une erreur, elle ne sera pas indexée.',
  'image-alt':
    "Ajoutez un attribut alt décrivant chaque image porteuse d'information. Pour une image purement décorative, laissez alt vide.",
  'image-delivery-insight':
    "Servez ces images dans un format moderne et à la taille réellement affichée. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  'image-legacy-format':
    "Convertissez ces images dans un format moderne comme WebP ou AVIF, à qualité visuelle comparable. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  'image-oversized':
    "Servez ces images à la taille où elles sont réellement affichées, plutôt qu'en pleine résolution redimensionnée par le navigateur.",
  'input-button-name':
    'Donnez un intitulé à ce bouton de formulaire, avec un attribut value ou du texte visible.',
  'input-image-alt':
    "Ajoutez un attribut alt à ce bouton image, décrivant l'action déclenchée plutôt que l'image elle-même.",
  'interaction-to-next-paint':
    "Réduisez le délai entre le clic et la réaction visible de la page, en allégeant le code exécuté au moment de l'interaction.",
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
  'label-content-name-mismatch':
    'Faites en sorte que le nom accessible reprenne le texte visible du contrôle, pour que la commande vocale fonctionne sur le libellé affiché.',
  'largest-contentful-paint':
    "Accélérez l'affichage du plus grand élément visible, en général l'image principale : préchargez-la et ne la chargez pas en différé.",
  'largest-contentful-paint-element':
    "Identifiez l'élément le plus lent à s'afficher et traitez-le en priorité : c'est lui qui détermine la mesure.",
  'layout-shifts':
    'Donnez des dimensions explicites aux images et réservez la place des éléments injectés après coup.',
  'lcen-mentions-legales-missing':
    "Publiez sur le site les informations d'identification de l'entreprise, dont le numéro SIREN ou RCS. Le critère exact et sa source figurent dans la section consacrée à l'exposition légale. Le contrôle automatique porte sur la page atteinte depuis le lien Mentions légales ; des informations légales peuvent exister ailleurs (page non visitée, document séparé, prestataire externe).",
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
  list: 'Ne placez dans une liste que des entrées de liste, en sortant les autres éléments.',
  listitem: 'Placez chaque entrée de liste dans une balise de liste, ul ou ol.',
  'llms-txt-missing':
    "Publiez un fichier /llms.txt à la racine du site pour indiquer aux moteurs de réponse par IA ce qu'est le site et comment le référencer. Convention récente, pas encore un standard : une opportunité plutôt qu'un défaut.",
  'long-tasks':
    'Découpez les traitements longs en tâches plus courtes, pour que la page continue de répondre aux clics pendant leur exécution.',
  'mainthread-work-breakdown':
    'Réduisez le travail effectué par le navigateur au chargement : moins de scripts, moins de recalculs de style.',
  marquee: 'Supprimez le défilement automatique du texte et affichez ce contenu de façon fixe.',
  'max-potential-fid':
    'Découpez les tâches JavaScript longues, pour que la page reste capable de répondre à un clic pendant son chargement.',
  'meta-description':
    "Ajoutez une meta description à chaque page : c'est le texte affiché sous le titre dans les résultats de recherche.",
  'meta-description-length':
    "Ajustez la longueur de la meta description pour qu'elle reste lisible entière dans les résultats de recherche, autour de 120 à 160 caractères.",
  'meta-description-missing':
    'Ajoutez une meta description à cette page, pour choisir vous-même le résumé affiché sous le titre dans les résultats de recherche.',
  'meta-refresh':
    'Supprimez le rechargement automatique de la page, ou laissez le visiteur le déclencher lui-même.',
  'meta-title-length':
    "Ajustez la longueur du titre de la page pour qu'il ne soit pas tronqué dans les résultats de recherche, autour de 30 à 60 caractères.",
  'meta-title-missing':
    "Donnez un titre à cette page : c'est le libellé affiché dans l'onglet du navigateur et en tête du résultat de recherche.",
  'meta-viewport':
    'Retirez user-scalable=no et toute limite de maximum-scale de la balise viewport, pour que le zoom reste possible.',
  'mixed-content':
    'Servez ces fichiers en HTTPS comme le reste de la page, ou retirez-les : en HTTP simple, les navigateurs les bloquent ou affichent un avertissement de sécurité.',
  'modern-http-insight':
    'Activez une version récente du protocole HTTP sur votre hébergement, pour que les fichiers se chargent en parallèle.',
  'modern-image-formats':
    "Convertissez ces images dans un format moderne comme WebP ou AVIF. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
  'multiple-h1':
    "Ne gardez qu'un seul titre de niveau 1 par page et passez les autres en niveau 2.",
  'nap-phone-mismatch':
    'Alignez le numéro de téléphone des données structurées sur celui affiché aux visiteurs, pour que les deux versions concordent.',
  'nap-postal-code-mismatch':
    "Alignez le code postal des données structurées sur l'adresse affichée aux visiteurs, pour que les deux versions concordent.",
  'nested-interactive':
    "Ne placez pas un contrôle cliquable à l'intérieur d'un autre. Sortez le bouton ou le lien imbriqué de son parent.",
  'network-dependency-tree-insight':
    "Raccourcissez les chaînes de requêtes en cascade : chaque niveau supplémentaire ajoute un aller-retour avant l'affichage.",
  'no-autoplay-audio':
    "Ne démarrez pas le son automatiquement, ou fournissez un bouton d'arrêt accessible dès le début de la lecture.",
  'no-h1': 'Ajoutez un titre de niveau 1 décrivant le sujet de la page.',
  'noindex-on-public-page':
    "Retirez l'instruction d'exclusion sur cette page si elle doit apparaître dans les résultats de recherche.",
  'non-composited-animations':
    "Animez uniquement les propriétés de transformation et d'opacité, que le navigateur peut traiter sans redessiner la page.",
  'object-alt':
    'Ajoutez une description textuelle à ce contenu embarqué, pour que son information reste accessible.',
  'offscreen-images':
    "Chargez en différé les images situées hors de l'écran au premier affichage, en gardant l'image principale en chargement immédiat.",
  'opengraph-missing':
    "Ajoutez les balises Open Graph (titre, description, image) pour contrôler l'aperçu affiché lors d'un partage sur les réseaux sociaux.",
  'p-as-heading':
    "Utilisez une vraie balise de titre pour ce texte, plutôt qu'un paragraphe grossi ou mis en gras.",
  'prioritize-lcp-image':
    "Préchargez l'image principale de la page, pour que le navigateur la demande sans attendre.",
  'redirect-chain-excessive':
    'Raccourcissez la chaîne de redirections en faisant pointer la première adresse directement vers la destination finale.',
  redirects:
    "Faites pointer les liens directement vers l'adresse finale, pour supprimer les redirections intermédiaires.",
  'reflow-horizontal-scroll':
    "Rendez la mise en page adaptable jusqu'à une largeur de 320 pixels, sans défilement horizontal.",
  'render-blocking-insight':
    'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
  'render-blocking-resources':
    'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
  'robots-blocks-indexing':
    "Retirez du fichier robots.txt la règle qui interdit l'accès à la page d'accueil, sans quoi le site peut disparaître des résultats de recherche.",
  'robots-disallow-broad':
    "Resserrez la règle du fichier robots.txt : telle qu'elle est écrite, elle bloque une part importante des pages du site.",
  'robots-txt':
    'Corrigez la syntaxe du fichier robots.txt : telle quelle, une partie de son contenu est ignorée.',
  'role-img-alt':
    'Ajoutez une description accessible à cet élément déclaré comme image, avec un attribut aria-label.',
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
  'server-side-image-map':
    'Remplacez cette image cliquable traitée côté serveur par des liens ordinaires, utilisables au clavier.',
  'sitemap-missing':
    'Publiez un fichier sitemap.xml listant les pages du site et déclarez-le dans le fichier robots.txt, pour ne pas laisser leur découverte reposer sur les seuls liens internes.',
  'sitemap-orphan-page':
    'Ajoutez un lien vers ces pages depuis la navigation du site, ou retirez-les du plan de site. Une page listée mais jamais liée est difficile à atteindre.',
  'sitemap-stale':
    "Regénérez le plan de site pour qu'il corresponde aux pages actuellement publiées.",
  'speed-index':
    "Accélérez le remplissage visuel de la page, en traitant d'abord ce qui bloque le rendu et le poids des images.",
  'structured-data':
    "Faites valider les données structurées de la page avec un outil dédié : Lighthouse signale ce contrôle sans l'effectuer lui-même.",
  'structured-data-entity-missing':
    "Ajoutez des données structurées identifiant l'établissement (type, nom, adresse), pour que les assistants de recherche puissent le citer.",
  'structured-data-invalid':
    "Complétez les champs manquants des données structurées : en l'état, Google les lit mais n'en tire pas tout ce qu'il pourrait afficher.",
  'summary-name': "Donnez un intitulé au résumé de ce bloc dépliable, décrivant ce qu'il contient.",
  'svg-img-alt':
    'Ajoutez une description accessible à cette image vectorielle, avec une balise title ou un attribut aria-label.',
  'table-fake-caption':
    "Utilisez une vraie balise caption pour le titre du tableau, au lieu d'une ligne ordinaire.",
  'target-size':
    "Portez les zones cliquables à au moins 24 pixels de côté, ou espacez-les davantage. Il s'agit en général d'une seule règle de style à corriger sur un groupe de contrôles.",
  'td-has-header':
    'Rattachez chaque cellule de ce grand tableau à ses en-têtes de ligne et de colonne.',
  'td-headers-attr':
    "Corrigez les références d'en-tête de ces cellules : elles doivent pointer vers des en-têtes existants du même tableau.",
  'text-missing-from-raw-html':
    "Faites en sorte que le contenu soit présent dans le HTML servi, sans attendre l'exécution du JavaScript, par un rendu côté serveur ou une prégénération des pages.",
  'th-has-data-cells':
    "Rattachez cet en-tête aux cellules qu'il décrit, ou traitez le tableau comme un tableau de mise en page s'il ne contient pas de données.",
  'third-parties-insight':
    'Passez en revue les services tiers chargés par la page et retirez ceux qui ne sont plus nécessaires.',
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
  'valid-lang': 'Corrigez le code de langue de ce passage de texte avec un code reconnu.',
  'video-caption':
    'Ajoutez une piste de sous-titres à cette vidéo, pour que son contenu parlé soit accessible.',
  'video-missing-captions':
    "Ajoutez une piste de sous-titres aux vidéos porteuses de parole ou d'information sonore.",
  'viewport-insight':
    'Déclarez une balise viewport adaptée aux mobiles, pour que la page réagisse sans délai au premier contact tactile.',
  'youtube-tracking-embed':
    'Remplacez le domaine youtube.com par youtube-nocookie.com dans le code de la vidéo : la même vidéo est servie, sans les cookies publicitaires déposés au chargement.',
};
