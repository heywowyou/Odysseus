import type { RemediationEntry } from './snippet.js';

/**
 * Fixed remediation copy, one line per scanner rule id, French, plus a
 * deterministic fix snippet (plan 041 Part A). Written and reviewed as
 * content, never generated: this is the whole substance of the "Reste a
 * traiter" section, which exists because a real report gave a client seven
 * ranked priorities and left every other finding as an annex row with no
 * guidance at all (2026-08 Palais Gallien review, retained in Git history,
 * item 3.2).
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
 * One imperative sentence each for `text`. Where several rules describe one
 * action over a set of files, the copy says so, because that is exactly the
 * distinction the annex collapse (trade-off 30) is built on.
 *
 * `snippet` is a separate, code-owned classification per rule id (fixed,
 * fill-in-blank, or not-applicable; see FixSnippet in index.ts), added
 * 2026-09-12 per the brainstorm at
 * docs/product/fix-snippets-and-scorecard-brainstorm.md. It is enforced by
 * the type system, not a runtime test: RemediationEntry.snippet is
 * non-optional, so an entry missing it fails to compile.
 */
export const REMEDIATION_FR: Readonly<Record<string, RemediationEntry>> = {
  'accessibility-statement-missing': {
    text: "Bonne pratique facultative, sauf pour les organismes publics et les entreprises de plus de 250 millions d'euros de chiffre d'affaires (article 47 de la loi n° 2005-102) : envisagez de publier une déclaration d'accessibilité et d'ajouter un lien depuis le pied de page.",
    snippet: { kind: 'not-applicable' },
  },
  'ai-crawler-blocked': {
    text: "Retirez du fichier robots.txt la règle qui interdit ce robot d'assistant IA, si vous souhaitez que le site puisse être cité dans ses réponses.",
    snippet: { kind: 'fixed', template: 'User-agent: GPTBot\nAllow: /' },
  },
  'alt-text-quality-heuristic': {
    text: "Reprenez le texte alternatif de ces images pour qu'il décrive ce que chacune montre réellement. Ce point demande une relecture humaine, pas un correctif automatique.",
    snippet: {
      kind: 'fill-in-blank',
      template: 'alt="<décrivez ce que montre réellement l\'image>"',
    },
  },
  'area-alt': {
    text: "Ajoutez un attribut alt à chaque zone cliquable d'une image, décrivant la destination du lien.",
    snippet: { kind: 'fill-in-blank', template: '<area alt="<destination du lien>" ...>' },
  },
  'aria-allowed-attr': {
    text: "Retirez l'attribut ARIA que le rôle de cet élément n'accepte pas, ou remplacez le rôle par celui qui correspond réellement au composant.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-braille-equivalent': {
    text: "Ajoutez l'étiquette texte correspondant à l'étiquette braille, ou retirez cette dernière si elle fait double emploi.",
    snippet: {
      kind: 'fill-in-blank',
      template: 'aria-label="<contenu identique à l\'étiquette braille>"',
    },
  },
  'aria-command-name': {
    text: "Donnez un nom lisible à chaque bouton ou lien porteur d'un rôle ARIA, avec du texte visible ou un attribut aria-label.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<button aria-label="<nom du bouton>">...</button>',
    },
  },
  'aria-conditional-attr': {
    text: "Retirez cet attribut ARIA, ou placez l'élément dans la situation où la spécification l'autorise.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-deprecated-role': {
    text: "Remplacez ce rôle ARIA obsolète par le rôle actuel équivalent, ou par l'élément HTML natif qui joue le même rôle.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-hidden-body': {
    text: "Retirez l'attribut aria-hidden posé sur le corps de la page : en l'état, un lecteur d'écran ne voit aucun contenu.",
    snippet: { kind: 'fixed', template: '<body>' },
  },
  'aria-hidden-focus': {
    text: 'Retirez du parcours clavier les éléments masqués aux lecteurs d\'écran, avec tabindex="-1", ou cessez de les masquer.',
    snippet: {
      kind: 'fixed',
      template: '<div aria-hidden="true">\n  <a href="..." tabindex="-1">...</a>\n</div>',
    },
  },
  'aria-input-field-name': {
    text: 'Donnez un nom à ce champ de saisie, avec une étiquette visible reliée au champ ou un attribut aria-label.',
    snippet: { kind: 'fill-in-blank', template: '<input aria-label="<nom du champ>">' },
  },
  'aria-meter-name': {
    text: "Donnez un nom à cet indicateur de mesure, pour que sa valeur soit annoncée avec ce qu'elle mesure.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="meter" aria-label="<ce que mesure cette jauge>">',
    },
  },
  'aria-progressbar-name': {
    text: "Donnez un nom à cette barre de progression, pour que le pourcentage annoncé indique de quoi il s'agit.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="progressbar" aria-label="<nom de cette progression>">',
    },
  },
  'aria-prohibited-attr': {
    text: "Retirez cet attribut ARIA : il est interdit sur ce type d'élément et provoque une annonce incorrecte.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-required-attr': {
    text: 'Ajoutez les attributs ARIA que ce rôle exige, sans lesquels le composant est annoncé de façon incomplète.',
    snippet: { kind: 'fixed', template: '<div role="switch" aria-checked="false">...</div>' },
  },
  'aria-required-children': {
    text: 'Corrigez la structure ARIA : un rôle de type menu ou liste doit contenir directement les rôles enfants que la spécification attend.',
    snippet: {
      kind: 'fixed',
      template: '<ul role="listbox">\n  <li role="option">...</li>\n</ul>',
    },
  },
  'aria-required-parent': {
    text: 'Placez cet élément dans le conteneur que son rôle exige, par exemple une option dans une liste.',
    snippet: {
      kind: 'fixed',
      template: '<ul role="listbox">\n  <li role="option">...</li>\n</ul>',
    },
  },
  'aria-roledescription': {
    text: 'Donnez un rôle à cet élément, ou retirez la description de rôle : sans rôle, elle ne sera jamais annoncée.',
    snippet: { kind: 'not-applicable' },
  },
  'aria-roles': {
    text: "Corrigez la valeur du rôle ARIA : celle indiquée n'existe pas dans la spécification, en général une faute de frappe.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-tab-name': {
    text: 'Donnez un nom à chaque onglet, décrivant le contenu vers lequel il mène.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="tab" aria-label="<contenu de l\'onglet>">',
    },
  },
  'aria-toggle-field-name': {
    text: "Donnez un nom à ce contrôle à deux états, pour que la personne sache ce qu'il commande.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<button role="switch" aria-label="<ce que ce contrôle active>">',
    },
  },
  'aria-tooltip-name': {
    text: "Donnez un contenu textuel accessible à cette infobulle, sans quoi son information n'est pas transmise.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="tooltip"><votre texte d\'infobulle></div>',
    },
  },
  'aria-valid-attr': {
    text: "Corrigez le nom de cet attribut ARIA : il n'existe pas dans la spécification et il est donc ignoré.",
    snippet: { kind: 'not-applicable' },
  },
  'aria-valid-attr-value': {
    text: 'Corrigez la valeur de cet attribut ARIA, souvent une référence vers un identifiant absent de la page.',
    snippet: { kind: 'not-applicable' },
  },
  'audio-caption': {
    text: "Publiez une transcription texte du contenu audio, ou des sous-titres lorsqu'il accompagne une vidéo.",
    snippet: {
      kind: 'fixed',
      template:
        '<audio controls>\n  <source src="...">\n  <track kind="captions" src="transcription.vtt" srclang="fr">\n</audio>',
    },
  },
  'autocomplete-valid': {
    text: "Corrigez l'attribut autocomplete avec l'un des mots-clés reconnus, pour que le navigateur puisse pré-remplir le champ.",
    snippet: { kind: 'fixed', template: '<input type="email" autocomplete="email">' },
  },
  'avoid-inline-spacing': {
    text: "Retirez l'espacement des lettres et des lignes fixé directement sur l'élément, et gérez-le dans la feuille de style.",
    snippet: { kind: 'not-applicable' },
  },
  'bf-cache': {
    text: "Retirez ce qui empêche la restauration instantanée de la page lors d'un retour arrière, en général un en-tête no-store ou un écouteur d'événement unload.",
    snippet: { kind: 'not-applicable' },
  },
  blink: {
    text: 'Supprimez le clignotement du contenu : aucun réglage ne rend cet effet conforme.',
    snippet: { kind: 'not-applicable' },
  },
  'bootup-time': {
    text: "Réduisez le temps d'exécution du JavaScript, en différant les scripts non essentiels au premier affichage.",
    snippet: { kind: 'not-applicable' },
  },
  'broken-internal-link': {
    text: 'Corrigez ou supprimez les liens internes qui ne mènent plus à une page existante.',
    snippet: { kind: 'not-applicable' },
  },
  'button-name': {
    text: "Ajoutez du texte visible dans chaque bouton, ou un attribut aria-label lorsque le bouton n'affiche qu'une icône.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<button aria-label="<action du bouton>"><svg .../></button>',
    },
  },
  bypass: {
    text: "Ajoutez un lien d'évitement en tête de page, ou des repères de structure et un titre de niveau 1, pour permettre d'atteindre le contenu sans retraverser le menu.",
    snippet: { kind: 'fixed', template: '<a class="skip-link" href="#main">Aller au contenu</a>' },
  },
  'cache-insight': {
    text: 'Allongez la durée de mise en cache des fichiers qui changent rarement (images, styles, scripts).',
    snippet: { kind: 'not-applicable' },
  },
  canonical: {
    text: 'Corrigez la balise canonique : elle doit contenir une adresse absolue et valide, pointant vers la version de référence de la page.',
    snippet: { kind: 'not-applicable' },
  },
  'canonical-conflicting': {
    text: "Ne déclarez qu'une seule URL canonique par page : tant que plusieurs se contredisent, les moteurs de recherche en retiennent une au hasard.",
    snippet: { kind: 'not-applicable' },
  },
  'canonical-missing': {
    text: "Déclarez une URL canonique sur chaque page, pointant vers l'adresse que vous voulez voir indexée.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="canonical" href="<adresse absolue de cette page>">',
    },
  },
  'canonical-target-noindex': {
    text: "Faites pointer la balise canonique vers une page indexable, ou retirez l'exclusion sur la page ciblée. En l'état, les deux instructions se contredisent.",
    snippet: { kind: 'not-applicable' },
  },
  'canonical-target-unreachable': {
    text: 'Corrigez ou retirez la balise canonique : elle pointe vers une page que les moteurs de recherche ne peuvent pas atteindre, qui ne peut donc pas servir de version de référence.',
    snippet: { kind: 'not-applicable' },
  },
  'cls-culprits-insight': {
    text: 'Réservez la place des éléments qui arrivent après le premier affichage, pour que le contenu ne se déplace plus sous les yeux du visiteur.',
    snippet: { kind: 'not-applicable' },
  },
  'color-contrast': {
    text: "Augmentez le contraste entre le texte et son fond jusqu'à au moins 4,5 pour 1, ou 3 pour 1 pour les grands caractères. Corrigez la règle de style, pas chaque élément.",
    snippet: { kind: 'not-applicable' },
  },
  'consent-mechanism-absent': {
    text: "Mettez en place un mécanisme de consentement sur le site, capable de bloquer les composants de mesure et de publicité tant que le visiteur n'a rien accepté.",
    snippet: { kind: 'not-applicable' },
  },
  'cookie-non-essential-before-consent': {
    text: 'Reportez le dépôt des cookies de mesure et de publicité après le choix du visiteur. Seuls les cookies nécessaires au fonctionnement du site peuvent être écrits avant.',
    snippet: { kind: 'not-applicable' },
  },
  'crawlable-anchors': {
    text: "Rendez ces liens explorables : utilisez une balise a avec un attribut href, plutôt qu'un élément rendu cliquable par JavaScript.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<a href="<adresse de destination>">texte du lien</a>',
    },
  },
  'crux-cls-poor': {
    text: "Stabilisez la mise en page pendant le chargement, en donnant des dimensions aux images et en réservant la place des bannières. Ces mesures proviennent de données de terrain et non d'une simulation.",
    snippet: { kind: 'not-applicable' },
  },
  'crux-inp-poor': {
    text: "Réduisez le travail que le navigateur effectue au moment des clics et des saisies. Ces mesures proviennent de données de terrain et non d'une simulation.",
    snippet: { kind: 'not-applicable' },
  },
  'crux-lcp-poor': {
    text: "Accélérez l'affichage du plus grand élément visible de la page, en général l'image principale. Ces mesures proviennent de données de terrain.",
    snippet: { kind: 'not-applicable' },
  },
  'css-orientation-lock': {
    text: "Laissez la page s'afficher en portrait comme en paysage, sans verrouiller l'orientation.",
    snippet: { kind: 'not-applicable' },
  },
  'cumulative-layout-shift': {
    text: 'Stabilisez la mise en page pendant le chargement, en donnant des dimensions aux images et en réservant la place des bannières.',
    snippet: { kind: 'not-applicable' },
  },
  'definition-list': {
    text: 'Ne placez dans une liste de définitions que des termes et leurs définitions, sans autre élément intercalé.',
    snippet: { kind: 'fixed', template: '<dl>\n  <dt>...</dt>\n  <dd>...</dd>\n</dl>' },
  },
  dlitem: {
    text: 'Placez chaque terme et sa définition dans une liste de définitions, pour que le lien entre les deux soit conservé.',
    snippet: { kind: 'fixed', template: '<dl>\n  <dt>...</dt>\n  <dd>...</dd>\n</dl>' },
  },
  'document-latency-insight': {
    text: 'Réduisez le délai de réponse du serveur pour le document principal, avant même que le navigateur ne commence à afficher quoi que ce soit.',
    snippet: { kind: 'not-applicable' },
  },
  'document-title': {
    text: 'Donnez à chaque page une balise title unique qui décrit son contenu.',
    snippet: { kind: 'fill-in-blank', template: '<title><titre décrivant cette page></title>' },
  },
  'dom-size': {
    text: "Allégez la structure de la page : un nombre d'éléments très élevé ralentit chaque calcul de mise en page.",
    snippet: { kind: 'not-applicable' },
  },
  'dom-size-insight': {
    text: "Allégez la structure de la page : un nombre d'éléments très élevé ralentit chaque calcul de mise en page.",
    snippet: { kind: 'not-applicable' },
  },
  'duplicate-id-aria': {
    text: 'Rendez cet identifiant unique dans la page : une étiquette ou un attribut ARIA y fait référence, et la référence devient ambiguë.',
    snippet: { kind: 'not-applicable' },
  },
  'duplicated-javascript-insight': {
    text: 'Supprimez le code JavaScript téléchargé en double, en général une bibliothèque incluse par plusieurs scripts.',
    snippet: { kind: 'not-applicable' },
  },
  'entity-data-incomplete': {
    text: "Complétez les données structurées de l'établissement avec au minimum son nom, son adresse et son téléphone.",
    snippet: {
      kind: 'fill-in-blank',
      template: '"name": "<nom de l\'établissement>", "address": {...}, "telephone": "<numéro>"',
    },
  },
  'faq-content-without-schema': {
    text: 'Ajoutez un balisage de données structurées de type FAQPage sur les pages qui présentent des questions et réponses.',
    snippet: {
      kind: 'fill-in-blank',
      template:
        '{ "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "<question>", "acceptedAnswer": { "@type": "Answer", "text": "<réponse>" } }] }',
    },
  },
  'first-contentful-paint': {
    text: 'Accélérez le premier affichage : réduisez ce qui bloque le rendu et allégez la réponse du serveur.',
    snippet: { kind: 'not-applicable' },
  },
  'focus-order-mismatch': {
    text: "Retirez les valeurs de tabindex positives, pour que la tabulation suive l'ordre du code de la page, et placez les éléments dans le code dans l'ordre où ils s'affichent.",
    snippet: { kind: 'not-applicable' },
  },
  'font-display': {
    text: 'Ajoutez font-display: swap à vos polices, pour que le texte reste lisible pendant leur chargement.',
    snippet: { kind: 'fixed', template: '@font-face { ... font-display: swap; }' },
  },
  'font-display-insight': {
    text: 'Ajoutez font-display: swap à vos polices, pour que le texte reste lisible pendant leur chargement.',
    snippet: { kind: 'fixed', template: '@font-face { ... font-display: swap; }' },
  },
  'forced-reflow-insight': {
    text: 'Regroupez les lectures et les écritures de mise en page dans vos scripts, pour éviter de forcer le navigateur à tout recalculer plusieurs fois.',
    snippet: { kind: 'not-applicable' },
  },
  'form-error-not-associated': {
    text: "Associez chaque message d'erreur de formulaire au champ concerné, avec aria-invalid=\"true\" et aria-describedby pointant vers le texte d'erreur, ou une zone role=\"alert\". Un changement d'apparence visuel seul n'est pas perçu par un lecteur d'écran.",
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<input aria-invalid="true" aria-describedby="err-1">\n<span id="err-1" role="alert"><message d\'erreur></span>',
    },
  },
  'placeholder-only-label': {
    text: "Donnez à chaque champ un libellé visible relié par l'attribut for, et gardez le texte indicatif pour un exemple de saisie. Le texte indicatif disparaît dès que la personne commence à écrire.",
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<label for="champ-1"><nom du champ></label>\n<input id="champ-1" placeholder="<exemple>">',
    },
  },
  'form-field-multiple-labels': {
    text: "Ne gardez qu'une seule étiquette par champ de formulaire, en fusionnant les intitulés si nécessaire.",
    snippet: { kind: 'fixed', template: '<label for="champ1">...</label>\n<input id="champ1">' },
  },
  'frame-focusable-content': {
    text: "Remettez ce cadre dans le parcours clavier, ou retirez les éléments interactifs qu'il contient.",
    snippet: { kind: 'not-applicable' },
  },
  'frame-title': {
    text: "Ajoutez un attribut title à chaque iframe, décrivant ce qu'elle contient (par exemple une carte ou un module de réservation).",
    snippet: { kind: 'fill-in-blank', template: '<iframe title="<contenu du cadre>" ...>' },
  },
  'frame-title-unique': {
    text: 'Donnez un titre distinct à chaque cadre, décrivant son contenu propre.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<iframe title="<contenu propre de ce cadre>" ...>',
    },
  },
  'heading-hierarchy-skip': {
    text: "Reprenez la hiérarchie des titres pour qu'elle descende sans sauter de niveau. Choisissez le niveau selon la structure, pas selon la taille voulue.",
    snippet: { kind: 'not-applicable' },
  },
  hreflang: {
    text: 'Corrigez les annotations hreflang de la page : chaque code de langue doit être valide et chaque adresse déclarée complète.',
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-invalid': {
    text: "Corrigez le code de langue ou de région de cette annotation hreflang : tel qu'il est écrit, il n'est pas reconnu et l'annotation est ignorée.",
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-target-invalid': {
    text: "Corrigez l'adresse de la version linguistique déclarée, afin qu'elle réponde comme une page publique valide du site.",
    snippet: { kind: 'not-applicable' },
  },
  'hreflang-missing': {
    text: 'Déclarez les annotations hreflang entre les versions linguistiques de chaque page, dans les deux sens.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="alternate" hreflang="en" href="<adresse de la version anglaise>">',
    },
  },
  'hreflang-no-return-link': {
    text: 'Ajoutez le lien hreflang de retour : chaque version linguistique doit déclarer toutes les autres, y compris elle-même.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<link rel="alternate" hreflang="fr" href="<adresse de cette page>">',
    },
  },
  'html-has-lang': {
    text: "Ajoutez l'attribut lang sur la balise html de chaque page, avec le code de la langue réellement utilisée.",
    snippet: { kind: 'fixed', template: '<html lang="fr">' },
  },
  'html-lang-valid': {
    text: 'Corrigez le code de langue de la page avec un code reconnu, par exemple fr ou en.',
    snippet: { kind: 'fixed', template: '<html lang="fr">' },
  },
  'html-structural-validity': {
    text: 'Corrigez le code HTML signalé : identifiants dupliqués, balises fermées dans le désordre, éléments placés dans un parent qui ne les accepte pas.',
    snippet: { kind: 'not-applicable' },
  },
  'html-xml-lang-mismatch': {
    text: "Faites concorder les deux déclarations de langue de la page, ou n'en gardez qu'une.",
    snippet: { kind: 'fixed', template: '<html lang="fr" xml:lang="fr">' },
  },
  'http-error-status': {
    text: "Rétablissez cette page, ou faites-la rediriger vers l'adresse qui l'a remplacée, puis corrigez les liens qui pointent encore vers elle.",
    snippet: { kind: 'not-applicable' },
  },
  'http-status-code': {
    text: 'Rétablissez une réponse normale pour cette page : tant que le serveur renvoie une erreur, elle ne sera pas indexée.',
    snippet: { kind: 'not-applicable' },
  },
  'image-alt': {
    text: "Ajoutez un attribut alt décrivant chaque image porteuse d'information. Pour une image purement décorative, laissez alt vide.",
    snippet: { kind: 'fill-in-blank', template: 'alt="<ce que montre l\'image>"' },
  },
  'image-delivery-insight': {
    text: "Utilisez un format moderne pour ces images et adaptez-les à leur taille d'affichage. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
    snippet: { kind: 'not-applicable' },
  },
  'image-legacy-format': {
    text: "Convertissez ces images dans un format moderne comme WebP ou AVIF, à qualité visuelle comparable. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
    snippet: { kind: 'not-applicable' },
  },
  'image-oversized': {
    text: "Fournissez ces images à la taille où elles sont réellement affichées, plutôt qu'en pleine résolution redimensionnée par le navigateur.",
    snippet: { kind: 'not-applicable' },
  },
  'input-button-name': {
    text: 'Donnez un intitulé à ce bouton de formulaire, avec un attribut value ou du texte visible.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<input type="submit" value="<intitulé du bouton>">',
    },
  },
  'input-image-alt': {
    text: "Ajoutez un attribut alt à ce bouton image, décrivant l'action déclenchée plutôt que l'image elle-même.",
    snippet: { kind: 'fill-in-blank', template: '<input type="image" alt="<action déclenchée>">' },
  },
  'interaction-to-next-paint': {
    text: "Réduisez le délai entre le clic et la réaction visible de la page, en allégeant le code exécuté au moment de l'interaction.",
    snippet: { kind: 'not-applicable' },
  },
  interactive: {
    text: 'Réduisez le temps avant que la page ne réponde aux clics, principalement en allégeant le JavaScript exécuté au chargement.',
    snippet: { kind: 'not-applicable' },
  },
  'is-crawlable': {
    text: "Retirez le blocage d'indexation sur cette page si elle doit apparaître dans les résultats de recherche.",
    snippet: { kind: 'not-applicable' },
  },
  'jsonld-invalid': {
    text: "Corrigez la syntaxe du bloc de données structurées : il n'est pas lisible en tant que JSON et est donc ignoré entièrement.",
    snippet: { kind: 'not-applicable' },
  },
  'jsonld-missing': {
    text: "Ajoutez un bloc de données structurées JSON-LD décrivant l'établissement, pour que les moteurs et les assistants de recherche puissent le lire.",
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "LodgingBusiness", "name": "<nom>", "address": {...} }</script>',
    },
  },
  'keyboard-trap': {
    text: 'Donnez un moyen de sortir de cet élément au clavier, par exemple la touche Echap ou un bouton de fermeture accessible, plutôt que de bloquer la touche de tabulation qui doit continuer à faire avancer le focus.',
    snippet: { kind: 'not-applicable' },
  },
  label: {
    text: "Associez une étiquette à chaque champ de formulaire, avec une balise label liée au champ. Un texte d'aide affiché dans le champ ne suffit pas.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<label for="champ1"><texte de l\'étiquette></label>\n<input id="champ1">',
    },
  },
  'label-content-name-mismatch': {
    text: 'Faites en sorte que le nom accessible reprenne le texte visible du contrôle, pour que la commande vocale fonctionne sur le libellé affiché.',
    snippet: { kind: 'not-applicable' },
  },
  'largest-contentful-paint': {
    text: "Accélérez l'affichage du plus grand élément visible, en général l'image principale : préchargez-la et ne la chargez pas en différé.",
    snippet: { kind: 'not-applicable' },
  },
  'largest-contentful-paint-element': {
    text: "Identifiez l'élément le plus lent à s'afficher et traitez-le en priorité : c'est lui qui détermine la mesure.",
    snippet: { kind: 'not-applicable' },
  },
  'layout-shifts': {
    text: 'Donnez des dimensions explicites aux images et réservez la place des éléments injectés après coup.',
    snippet: { kind: 'not-applicable' },
  },
  'lcen-mentions-legales-missing': {
    text: "Publiez sur le site les informations d'identification de l'entreprise, dont le numéro SIREN ou RCS. Le critère exact et sa source figurent dans la section consacrée à l'exposition légale. Le contrôle automatique porte sur la page atteinte depuis le lien Mentions légales ; des informations légales peuvent exister ailleurs (page non visitée, document séparé, prestataire externe).",
    snippet: { kind: 'not-applicable' },
  },
  'inp-breakdown-insight': {
    text: "Réduisez le délai entre le clic et la réponse visible de la page : allégez le code exécuté au moment de l'interaction et laissez le navigateur redessiner avant les traitements longs.",
    snippet: { kind: 'not-applicable' },
  },
  'lcp-breakdown-insight': {
    text: "Raccourcissez les étapes qui précèdent l'affichage du plus grand élément de la page : temps de réponse du serveur, découverte de l'image, puis son chargement.",
    snippet: { kind: 'not-applicable' },
  },
  'lcp-discovery-insight': {
    text: "Faites en sorte que le navigateur découvre l'image principale au plus tôt : déclarez-la dans le HTML plutôt que via un script.",
    snippet: { kind: 'not-applicable' },
  },
  'lcp-lazy-loaded': {
    text: "Retirez le chargement différé sur l'image principale : elle est visible immédiatement et le différé la retarde.",
    snippet: { kind: 'fixed', template: '<img src="..." loading="eager">' },
  },
  'legacy-javascript': {
    text: 'Ne transmettez plus aux navigateurs récents le code de compatibilité destiné aux anciens : il est téléchargé et exécuté pour rien.',
    snippet: { kind: 'not-applicable' },
  },
  'legacy-javascript-insight': {
    text: 'Ne transmettez plus aux navigateurs récents le code de compatibilité destiné aux anciens : il est téléchargé et exécuté pour rien.',
    snippet: { kind: 'not-applicable' },
  },
  'link-in-text-block': {
    text: 'Distinguez les liens du texte environnant autrement que par la couleur seule, par exemple avec un soulignement.',
    snippet: { kind: 'fixed', template: 'a { text-decoration: underline; }' },
  },
  'link-name': {
    text: "Donnez un texte lisible à chaque lien. Pour un lien qui n'entoure qu'une image, il suffit souvent de décrire cette image dans son attribut alt.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<a href="..."><img alt="<destination du lien>"></a>',
    },
  },
  'link-text': {
    text: 'Remplacez les libellés de liens génériques (cliquez ici, en savoir plus) par un texte qui décrit la destination.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<a href="..."><texte décrivant la destination></a>',
    },
  },
  list: {
    text: 'Ne placez dans une liste que des entrées de liste, en sortant les autres éléments.',
    snippet: { kind: 'fixed', template: '<ul>\n  <li>...</li>\n</ul>' },
  },
  listitem: {
    text: 'Placez chaque entrée de liste dans une balise de liste, ul ou ol.',
    snippet: { kind: 'fixed', template: '<ul>\n  <li>...</li>\n</ul>' },
  },
  'llms-txt-missing': {
    text: "Publiez un fichier /llms.txt à la racine du site pour indiquer aux moteurs de réponse par IA ce qu'est le site et comment le référencer. Convention récente, pas encore un standard : une opportunité plutôt qu'un défaut.",
    snippet: {
      kind: 'fill-in-blank',
      template: '# <nom du site>\n\n> <brève description du site>',
    },
  },
  'long-tasks': {
    text: 'Découpez les traitements longs en tâches plus courtes, pour que la page continue de répondre aux clics pendant leur exécution.',
    snippet: { kind: 'not-applicable' },
  },
  'mainthread-work-breakdown': {
    text: 'Réduisez le travail effectué par le navigateur au chargement, notamment le nombre de scripts et les recalculs de style.',
    snippet: { kind: 'not-applicable' },
  },
  marquee: {
    text: 'Supprimez le défilement automatique du texte et affichez ce contenu de façon fixe.',
    snippet: { kind: 'not-applicable' },
  },
  'max-potential-fid': {
    text: 'Découpez les tâches JavaScript longues, pour que la page reste capable de répondre à un clic pendant son chargement.',
    snippet: { kind: 'not-applicable' },
  },
  'meta-description': {
    text: "Ajoutez une méta-description à chaque page : c'est le texte affiché sous le titre dans les résultats de recherche.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<résumé de la page>">',
    },
  },
  'meta-description-length': {
    text: "Ajustez la longueur de la méta-description pour qu'elle reste lisible entière dans les résultats de recherche, entre 120 et 160 caractères.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<résumé de 120 à 160 caractères>">',
    },
  },
  'meta-description-missing': {
    text: 'Ajoutez une méta-description à chaque page concernée, pour choisir vous-même le résumé affiché sous le titre dans les résultats de recherche.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<meta name="description" content="<résumé de la page>">',
    },
  },
  'meta-refresh': {
    text: 'Supprimez le rechargement automatique de la page, ou laissez le visiteur le déclencher lui-même.',
    snippet: { kind: 'not-applicable' },
  },
  'meta-title-length': {
    text: "Ajustez la longueur du titre de la page pour qu'il ne soit pas tronqué dans les résultats de recherche, entre 30 et 65 caractères.",
    snippet: { kind: 'fill-in-blank', template: '<title><titre de 30 à 65 caractères></title>' },
  },
  'title-announces-error': {
    text: 'Donnez à ces pages un titre qui décrit leur contenu : un moteur de recherche peut écarter une page dont le titre annonce une erreur.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<title><titre décrivant le contenu de cette page></title>',
    },
  },
  'title-not-translated': {
    text: "Traduisez le titre de chaque version linguistique de la page : c'est le titre affiché en tête du résultat de recherche dans cette langue.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<title><titre rédigé dans la langue de la page></title>',
    },
  },
  'meta-title-missing': {
    text: "Donnez un titre à cette page : c'est le libellé affiché dans l'onglet du navigateur et en tête du résultat de recherche.",
    snippet: { kind: 'fill-in-blank', template: '<title><titre décrivant cette page></title>' },
  },
  'meta-viewport': {
    text: 'Retirez user-scalable=no et toute limite de maximum-scale de la balise viewport, pour que le zoom reste possible.',
    snippet: {
      kind: 'fixed',
      template: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    },
  },
  'mixed-content': {
    text: 'Chargez ces fichiers en HTTPS comme le reste de la page, ou retirez-les : en HTTP simple, les navigateurs les bloquent ou affichent un avertissement de sécurité.',
    snippet: { kind: 'not-applicable' },
  },
  'modern-http-insight': {
    text: 'Activez une version récente du protocole HTTP sur votre hébergement, pour que les fichiers se chargent en parallèle.',
    snippet: { kind: 'not-applicable' },
  },
  'modern-image-formats': {
    text: "Convertissez ces images dans un format moderne comme WebP ou AVIF. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
    snippet: { kind: 'not-applicable' },
  },
  'multiple-h1': {
    text: "Ne gardez qu'un seul titre de niveau 1 par page et passez les autres en niveau 2.",
    snippet: { kind: 'not-applicable' },
  },
  'nap-phone-mismatch': {
    text: 'Alignez le numéro de téléphone des données structurées sur celui affiché aux visiteurs, pour que les deux versions concordent.',
    snippet: { kind: 'not-applicable' },
  },
  'nap-postal-code-mismatch': {
    text: "Alignez le code postal des données structurées sur l'adresse affichée aux visiteurs, pour que les deux versions concordent.",
    snippet: { kind: 'not-applicable' },
  },
  'nested-interactive': {
    text: "Ne placez pas un contrôle cliquable à l'intérieur d'un autre. Sortez le bouton ou le lien imbriqué de son parent.",
    snippet: { kind: 'not-applicable' },
  },
  'network-dependency-tree-insight': {
    text: "Raccourcissez les chaînes de requêtes en cascade : chaque niveau supplémentaire ajoute un aller-retour avant l'affichage.",
    snippet: { kind: 'not-applicable' },
  },
  'no-autoplay-audio': {
    text: "Ne démarrez pas le son automatiquement, ou fournissez un bouton d'arrêt accessible dès le début de la lecture.",
    snippet: { kind: 'fixed', template: '<audio controls src="..."></audio>' },
  },
  'no-h1': {
    text: 'Ajoutez un titre de niveau 1 décrivant le sujet de la page.',
    snippet: { kind: 'fill-in-blank', template: '<h1><titre de la page></h1>' },
  },
  'noindex-on-public-page': {
    text: "Retirez l'instruction qui exclut cette page des résultats de recherche (noindex), si elle doit y apparaître.",
    snippet: { kind: 'not-applicable' },
  },
  'non-composited-animations': {
    text: "Animez uniquement les propriétés de transformation et d'opacité, que le navigateur peut traiter sans redessiner la page.",
    snippet: { kind: 'not-applicable' },
  },
  'object-alt': {
    text: 'Ajoutez une description textuelle à ce contenu embarqué, pour que son information reste accessible.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<object><description textuelle du contenu></object>',
    },
  },
  'offscreen-images': {
    text: "Chargez en différé les images situées hors de l'écran au premier affichage, en gardant l'image principale en chargement immédiat.",
    snippet: { kind: 'not-applicable' },
  },
  'opengraph-missing': {
    text: "Ajoutez les balises Open Graph (titre, description, image) pour contrôler l'aperçu affiché lors d'un partage sur les réseaux sociaux.",
    snippet: {
      kind: 'fill-in-blank',
      template:
        '<meta property="og:title" content="<titre>">\n<meta property="og:description" content="<description>">\n<meta property="og:image" content="<url image>">',
    },
  },
  'p-as-heading': {
    text: "Utilisez une vraie balise de titre pour ce texte, plutôt qu'un paragraphe grossi ou mis en gras.",
    snippet: { kind: 'fixed', template: '<h2>...</h2>' },
  },
  'prioritize-lcp-image': {
    text: "Préchargez l'image principale de la page, pour que le navigateur la demande sans attendre.",
    snippet: { kind: 'not-applicable' },
  },
  'redirect-chain-excessive': {
    text: 'Raccourcissez la chaîne de redirections en faisant pointer la première adresse directement vers la destination finale.',
    snippet: { kind: 'not-applicable' },
  },
  redirects: {
    text: "Faites pointer les liens directement vers l'adresse finale, pour supprimer les redirections intermédiaires.",
    snippet: { kind: 'not-applicable' },
  },
  'relative-link-nesting': {
    text: "Corrigez le lien relatif pour qu'il pointe vers le chemin attendu, sans ajouter un niveau de langue ou de répertoire par inadvertance.",
    snippet: { kind: 'not-applicable' },
  },
  'reflow-horizontal-scroll': {
    text: "Rendez la mise en page adaptable jusqu'à une largeur de 320 pixels, sans défilement horizontal.",
    snippet: { kind: 'not-applicable' },
  },
  'render-blocking-insight': {
    text: 'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
    snippet: { kind: 'not-applicable' },
  },
  'render-blocking-resources': {
    text: 'Différez ou intégrez les styles et scripts qui bloquent le premier affichage.',
    snippet: { kind: 'not-applicable' },
  },
  'robots-blocks-indexing': {
    text: "Retirez du fichier robots.txt la règle qui interdit l'accès à la page d'accueil, sans quoi le site peut disparaître des résultats de recherche.",
    snippet: { kind: 'not-applicable' },
  },
  'robots-disallow-broad': {
    text: "Resserrez la règle du fichier robots.txt : telle qu'elle est écrite, elle bloque une part importante des pages du site.",
    snippet: { kind: 'not-applicable' },
  },
  'robots-txt': {
    text: 'Corrigez la syntaxe du fichier robots.txt : telle quelle, une partie de son contenu est ignorée.',
    snippet: { kind: 'not-applicable' },
  },
  'role-img-alt': {
    text: 'Ajoutez une description accessible à cet élément déclaré comme image, avec un attribut aria-label.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<div role="img" aria-label="<description de l\'image>">',
    },
  },
  'scrollable-region-focusable': {
    text: 'Ajoutez tabindex="0" sur les zones que l\'on peut faire défiler, pour qu\'elles soient atteignables au clavier.',
    snippet: { kind: 'fixed', template: '<div tabindex="0">...</div>' },
  },
  'security-header-missing-csp': {
    text: "Ajoutez un en-tête Content-Security-Policy pour limiter les scripts que le navigateur accepte d'exécuter sur vos pages.",
    snippet: { kind: 'fixed', template: "Content-Security-Policy: default-src 'self'" },
  },
  'security-header-missing-hsts': {
    text: "Ajoutez un en-tête Strict-Transport-Security pour que le navigateur n'utilise que la connexion chiffrée.",
    snippet: {
      kind: 'fixed',
      template: 'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    },
  },
  'security-header-missing-permissions-policy': {
    text: 'Ajoutez un en-tête Permissions-Policy pour déclarer quelles fonctions du navigateur (caméra, micro, géolocalisation) le site utilise.',
    snippet: {
      kind: 'fixed',
      template: 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
    },
  },
  'security-header-missing-referrer-policy': {
    text: "Ajoutez un en-tête Referrer-Policy pour limiter l'adresse de la page que le navigateur transmet aux sites tiers.",
    snippet: { kind: 'fixed', template: 'Referrer-Policy: strict-origin-when-cross-origin' },
  },
  'security-header-missing-x-frame-options': {
    text: "Ajoutez un en-tête X-Frame-Options, ou la directive frame-ancestors équivalente, pour empêcher l'affichage du site dans le cadre d'un autre site.",
    snippet: { kind: 'fixed', template: 'X-Frame-Options: SAMEORIGIN' },
  },
  'select-name': {
    text: 'Associez une étiquette visible à chaque liste déroulante, ou donnez-lui un attribut aria-label.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<label for="s1"><étiquette></label>\n<select id="s1">',
    },
  },
  'server-response-time': {
    text: 'Réduisez le délai de première réponse du serveur, par la mise en cache côté serveur ou un hébergement plus rapide.',
    snippet: { kind: 'not-applicable' },
  },
  'server-side-image-map': {
    text: 'Remplacez cette image cliquable traitée côté serveur par des liens ordinaires, utilisables au clavier.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-missing': {
    text: 'Publiez un fichier sitemap.xml listant les pages du site et déclarez-le dans le fichier robots.txt, pour ne pas laisser leur découverte reposer sur les seuls liens internes.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<url><loc><adresse absolue de la page></loc></url>',
    },
  },
  'sitemap-orphan-page': {
    text: 'Ajoutez un lien vers ces pages depuis la navigation du site, ou retirez-les du plan de site. Une page listée mais jamais liée est difficile à atteindre.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-stale': {
    text: "Regénérez le plan de site pour qu'il corresponde aux pages actuellement publiées.",
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-lists-redirects': {
    text: 'Remplacez les entrées redirigées ou externes du plan de site par les URL finales et canoniques appartenant à ce site.',
    snippet: { kind: 'not-applicable' },
  },
  'sitemap-lists-noindex': {
    text: 'Retirez ces pages du plan de site si leur exclusion des résultats de recherche est voulue ; sinon, retirez la directive noindex.',
    snippet: { kind: 'not-applicable' },
  },
  'speed-index': {
    text: "Accélérez l'affichage progressif de la page, en traitant d'abord ce qui bloque le rendu et le poids des images.",
    snippet: { kind: 'not-applicable' },
  },
  'structured-data': {
    text: "Faites valider les données structurées de la page avec un outil dédié : Lighthouse signale ce contrôle sans l'effectuer lui-même.",
    snippet: { kind: 'not-applicable' },
  },
  'structured-data-entity-missing': {
    text: "Ajoutez des données structurées identifiant l'établissement (type, nom, adresse), pour que les assistants de recherche puissent le citer.",
    snippet: {
      kind: 'fill-in-blank',
      template: '"@type": "LodgingBusiness", "name": "<nom>", "address": {...}',
    },
  },
  'structured-data-invalid': {
    text: "Complétez les champs manquants des données structurées : en l'état, Google les lit mais n'en tire pas tout ce qu'il pourrait afficher.",
    snippet: { kind: 'not-applicable' },
  },
  'summary-name': {
    text: "Donnez un intitulé au résumé de ce bloc dépliable, décrivant ce qu'il contient.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<details><summary><ce que contient ce bloc></summary>...</details>',
    },
  },
  'svg-img-alt': {
    text: 'Ajoutez une description accessible à cette image vectorielle, avec une balise title ou un attribut aria-label.',
    snippet: {
      kind: 'fill-in-blank',
      template: "<svg><title><description de l'image></title></svg>",
    },
  },
  'table-fake-caption': {
    text: "Utilisez une vraie balise caption pour le titre du tableau, au lieu d'une ligne ordinaire.",
    snippet: {
      kind: 'fill-in-blank',
      template: '<table><caption><titre du tableau></caption>...</table>',
    },
  },
  'target-size': {
    text: "Portez les zones cliquables à au moins 24 pixels de côté, ou espacez-les davantage. Il s'agit en général d'une seule règle de style à corriger sur un groupe de contrôles.",
    snippet: {
      kind: 'fixed',
      template: '{{selector}} {\n  min-width: 24px;\n  min-height: 24px;\n}',
    },
  },
  'td-has-header': {
    text: 'Rattachez chaque cellule de ce grand tableau à ses en-têtes de ligne et de colonne.',
    snippet: { kind: 'fixed', template: '<td headers="en1 en2">' },
  },
  'td-headers-attr': {
    text: "Corrigez les références d'en-tête de ces cellules : elles doivent pointer vers des en-têtes existants du même tableau.",
    snippet: { kind: 'not-applicable' },
  },
  'text-missing-from-raw-html': {
    text: "Faites en sorte que le contenu soit présent dans le HTML servi, sans attendre l'exécution du JavaScript, par un rendu côté serveur ou une prégénération des pages.",
    snippet: { kind: 'not-applicable' },
  },
  'th-has-data-cells': {
    text: "Rattachez cet en-tête aux cellules qu'il décrit, ou traitez le tableau comme un tableau de mise en page s'il ne contient pas de données.",
    snippet: { kind: 'not-applicable' },
  },
  'third-parties-insight': {
    text: 'Passez en revue les services tiers chargés par la page et retirez ceux qui ne sont plus nécessaires.',
    snippet: { kind: 'not-applicable' },
  },
  'third-party-data-transfer': {
    text: "Passez en revue les prestataires tiers sollicités au chargement et retirez ceux qui ne sont pas nécessaires. Chacun reçoit l'adresse IP du visiteur.",
    snippet: { kind: 'not-applicable' },
  },
  'third-party-facades': {
    text: "Remplacez les modules tiers lourds (vidéo, chat, carte) par une image cliquable qui ne les charge qu'à la demande.",
    snippet: { kind: 'not-applicable' },
  },
  'third-party-summary': {
    text: 'Passez en revue les scripts tiers chargés et retirez ceux qui ne sont plus utilisés.',
    snippet: { kind: 'not-applicable' },
  },
  'total-blocking-time': {
    text: "Découpez les tâches JavaScript longues et différez ce qui n'est pas nécessaire au premier affichage.",
    snippet: { kind: 'not-applicable' },
  },
  'total-byte-weight': {
    text: 'Réduisez le poids total téléchargé par page, principalement en compressant les images et en supprimant le code inutilisé.',
    snippet: { kind: 'not-applicable' },
  },
  'tracker-request-before-consent': {
    text: "Bloquez le chargement de ces traceurs tant que le visiteur n'a pas donné son consentement. Une requête vers ces domaines transmet déjà son adresse IP et la page consultée, même sans dépôt de cookie.",
    snippet: { kind: 'not-applicable' },
  },
  'unminified-css': {
    text: 'Activez la minification des feuilles de style dans votre chaîne de publication.',
    snippet: { kind: 'not-applicable' },
  },
  'unminified-javascript': {
    text: 'Activez la minification du JavaScript dans votre chaîne de publication.',
    snippet: { kind: 'not-applicable' },
  },
  'unsized-images': {
    text: 'Ajoutez les attributs width et height sur les images, pour que le navigateur réserve leur place avant de les charger.',
    snippet: {
      kind: 'fill-in-blank',
      template: '<img src="..." width="<largeur réelle>" height="<hauteur réelle>">',
    },
  },
  'unused-css-rules': {
    text: "Supprimez ou découpez les feuilles de style dont la majeure partie n'est pas utilisée sur la page chargée.",
    snippet: { kind: 'not-applicable' },
  },
  'unused-javascript': {
    text: "Supprimez ou découpez les scripts dont la majeure partie n'est pas utilisée sur la page chargée.",
    snippet: { kind: 'not-applicable' },
  },
  'uses-http2': {
    text: "Activez HTTP/2 sur votre hébergement, pour que les fichiers se chargent en parallèle plutôt qu'à la suite.",
    snippet: { kind: 'not-applicable' },
  },
  'uses-long-cache-ttl': {
    text: 'Allongez la durée de mise en cache des fichiers statiques, pour que les visiteurs récurrents ne les retéléchargent pas.',
    snippet: { kind: 'fixed', template: 'Cache-Control: max-age=31536000, immutable' },
  },
  'uses-optimized-images': {
    text: "Recompressez ces images à une qualité adaptée au web. C'est une seule opération à mener sur l'ensemble des fichiers listés.",
    snippet: { kind: 'not-applicable' },
  },
  'uses-rel-preconnect': {
    text: 'Déclarez une préconnexion vers les domaines tiers sollicités tôt dans le chargement.',
    snippet: { kind: 'fill-in-blank', template: '<link rel="preconnect" href="<domaine tiers>">' },
  },
  'uses-responsive-images': {
    text: "Fournissez ces images aux dimensions réellement affichées, plutôt qu'en pleine résolution redimensionnée par le navigateur.",
    snippet: { kind: 'not-applicable' },
  },
  'uses-text-compression': {
    text: 'Activez la compression des réponses textuelles (gzip ou brotli) sur votre serveur.',
    snippet: { kind: 'not-applicable' },
  },
  'valid-lang': {
    text: 'Corrigez le code de langue de ce passage de texte avec un code reconnu.',
    snippet: { kind: 'fixed', template: '<span lang="en">...</span>' },
  },
  'video-caption': {
    text: 'Ajoutez une piste de sous-titres à cette vidéo, pour que son contenu parlé soit accessible.',
    snippet: {
      kind: 'fixed',
      template:
        '<video controls>\n  <source src="...">\n  <track kind="captions" src="sous-titres.vtt" srclang="fr">\n</video>',
    },
  },
  'video-missing-captions': {
    text: "Ajoutez une piste de sous-titres aux vidéos porteuses de parole ou d'information sonore.",
    snippet: {
      kind: 'fixed',
      template:
        '<video controls>\n  <source src="...">\n  <track kind="captions" src="sous-titres.vtt" srclang="fr">\n</video>',
    },
  },
  'viewport-insight': {
    text: 'Déclarez une balise viewport adaptée aux mobiles, pour que la page réagisse sans délai au premier contact tactile.',
    snippet: {
      kind: 'fixed',
      template: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    },
  },
  'youtube-tracking-embed': {
    text: 'Remplacez le domaine youtube.com par youtube-nocookie.com dans le code de la vidéo : la même vidéo est servie, sans les cookies publicitaires déposés au chargement.',
    snippet: {
      kind: 'fixed',
      template: '<iframe src="https://www.youtube-nocookie.com/embed/..."></iframe>',
    },
  },
};
