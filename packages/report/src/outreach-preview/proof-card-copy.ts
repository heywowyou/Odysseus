/**
 * Reviewed public-safe proof-card copy for outreach previews (v2 historical,
 * v3 current):
 * one bilingual sentence per scanner rule id, stating the observed problem in
 * words a non-technical hotel owner understands. Present tense, one sentence,
 * no fix, no legal conclusion, no statistics, no technical identifiers.
 *
 * Every entry is operator-approved copy. Twelve of them are reused verbatim
 * from the HOTEL_EVIDENCE_OBSERVATIONS allowlist in @odysseus/core, the
 * already approved observation vocabulary. Proof-card selection treats a
 * missing entry as card-ineligible (fail closed): a rule without an entry
 * here never reaches a prospect. A new scanner rule therefore requires a new
 * reviewed entry, and proof-card-copy.test.ts fails the build until one is
 * written.
 */
export interface OutreachProofCardCopyEntry {
  fr: string;
  en: string;
}

export const OUTREACH_PROOF_CARD_COPY: Readonly<Record<string, OutreachProofCardCopyEntry>> = {
  // axe rules reachable under the WCAG tag filter.
  'area-alt': {
    fr: "Une zone cliquable d'une image n'a pas de description textuelle.",
    en: 'A clickable area of an image map has no text description.',
  },
  'aria-allowed-attr': {
    fr: "Un élément porte un attribut d'accessibilité que son rôle n'accepte pas.",
    en: 'An element carries an accessibility attribute its role does not accept.',
  },
  'aria-braille-equivalent': {
    fr: "Une étiquette prévue pour un afficheur braille n'a pas d'équivalent en texte.",
    en: 'A label intended for braille displays has no text equivalent.',
  },
  'aria-command-name': {
    fr: "Un contrôle de type bouton ou lien n'a pas de nom accessible.",
    en: 'A button or link control has no accessible name.',
  },
  'aria-conditional-attr': {
    fr: "Un attribut d'accessibilité est utilisé dans une situation où il n'est pas prévu.",
    en: 'An accessibility attribute is used in a situation that does not allow it.',
  },
  'aria-deprecated-role': {
    fr: "Un élément déclare un rôle d'assistance obsolète.",
    en: 'An element declares an outdated accessibility role.',
  },
  'aria-hidden-body': {
    fr: "La page entière est masquée aux technologies d'assistance.",
    en: 'The whole page is hidden from assistive technology.',
  },
  'aria-hidden-focus': {
    fr: 'Un élément masqué reste atteignable au clavier.',
    en: 'A hidden element remains reachable by keyboard.',
  },
  'aria-input-field-name': {
    fr: "Un champ de saisie n'a pas de nom accessible.",
    en: 'An input field has no accessible name.',
  },
  'aria-meter-name': {
    fr: "Un indicateur de mesure n'a pas de nom accessible.",
    en: 'A meter has no accessible name.',
  },
  'aria-progressbar-name': {
    fr: "Une barre de progression n'a pas de nom accessible.",
    en: 'A progress bar has no accessible name.',
  },
  'aria-prohibited-attr': {
    fr: "Un attribut d'accessibilité interdit sur ce type d'élément est présent.",
    en: 'An accessibility attribute forbidden on this type of element is present.',
  },
  'aria-required-attr': {
    fr: "Un composant interactif manque d'un attribut d'accessibilité que son rôle exige.",
    en: 'An interactive component is missing an accessibility attribute its role requires.',
  },
  'aria-required-children': {
    fr: "Un composant de type menu ou liste n'a pas la structure interne attendue.",
    en: 'A menu or list component lacks the internal structure it requires.',
  },
  'aria-required-parent': {
    fr: 'Un élément se trouve hors du conteneur que son rôle exige.',
    en: 'An element sits outside the container its role requires.',
  },
  'aria-roledescription': {
    fr: "Une description de rôle est posée sur un élément qui n'a pas de rôle.",
    en: 'A role description is placed on an element with no role.',
  },
  'aria-roles': {
    fr: "Un élément déclare un rôle d'assistance qui n'existe pas.",
    en: 'An element declares an accessibility role that does not exist.',
  },
  'aria-tab-name': {
    fr: "Un onglet n'a pas de nom accessible.",
    en: 'A tab has no accessible name.',
  },
  'aria-toggle-field-name': {
    fr: "Un contrôle à deux états n'a pas de nom accessible.",
    en: 'A two-state control has no accessible name.',
  },
  'aria-tooltip-name': {
    fr: "Une infobulle n'a pas de contenu textuel accessible.",
    en: 'A tooltip has no accessible text content.',
  },
  'aria-valid-attr': {
    fr: "Un élément porte un attribut d'accessibilité qui n'existe pas.",
    en: 'An element carries an accessibility attribute that does not exist.',
  },
  'aria-valid-attr-value': {
    fr: "Un attribut d'accessibilité contient une valeur non reconnue.",
    en: 'An accessibility attribute holds an unrecognized value.',
  },
  'audio-caption': {
    fr: "Un contenu audio n'a ni transcription ni sous-titres.",
    en: 'An audio file has neither a transcript nor captions.',
  },
  'autocomplete-valid': {
    fr: 'Un champ de formulaire déclare un remplissage automatique que les navigateurs ne reconnaissent pas.',
    en: 'A form field declares an autocomplete hint browsers do not recognize.',
  },
  'avoid-inline-spacing': {
    fr: "L'espacement des lettres ou des lignes est imposé par le style de certains éléments.",
    en: 'Letter or line spacing is imposed by the style of some elements.',
  },
  blink: {
    fr: 'Un contenu de la page clignote.',
    en: 'Some page content blinks.',
  },
  'button-name': {
    fr: "Un bouton n'a pas de nom accessible.",
    en: 'A button has no accessible name.',
  },
  bypass: {
    fr: "La page n'offre aucun moyen d'atteindre le contenu sans traverser le menu.",
    en: 'The page offers no way to reach the content without going through the menu.',
  },
  'color-contrast': {
    fr: 'Un élément présente un contraste de couleur insuffisant.',
    en: 'An element has insufficient color contrast.',
  },
  'css-orientation-lock': {
    fr: "L'affichage de la page est verrouillé dans une seule orientation.",
    en: "The page's display is locked to a single orientation.",
  },
  'definition-list': {
    fr: "Une liste de définitions contient des éléments qui n'y ont pas leur place.",
    en: 'A definition list contains elements that do not belong in it.',
  },
  dlitem: {
    fr: "Un terme ou sa définition se trouve hors d'une liste de définitions.",
    en: 'A term or its definition sits outside a definition list.',
  },
  'document-title': {
    fr: "Une page n'a pas de titre.",
    en: 'A page has no title.',
  },
  'duplicate-id-aria': {
    fr: "Deux éléments portent le même identifiant alors qu'une étiquette y fait référence.",
    en: 'Two elements share an identifier that a label points at.',
  },
  'form-field-multiple-labels': {
    fr: 'Un champ de formulaire porte plusieurs étiquettes différentes.',
    en: 'A form field carries several different labels.',
  },
  'frame-focusable-content': {
    fr: 'Un cadre retiré du parcours clavier contient des éléments interactifs.',
    en: 'A frame removed from the keyboard path contains interactive elements.',
  },
  'frame-title': {
    fr: "Un cadre intégré, par exemple une carte ou un module de réservation, n'a pas de titre.",
    en: 'An embedded frame, such as a map or a booking widget, has no title.',
  },
  'frame-title-unique': {
    fr: 'Plusieurs cadres de la page portent le même titre.',
    en: 'Several frames on the page carry the same title.',
  },
  'html-has-lang': {
    fr: "La langue principale de la page n'est pas déclarée.",
    en: 'The page language is not declared.',
  },
  'html-lang-valid': {
    fr: "La langue déclarée de la page n'est pas un code reconnu.",
    en: "The page's declared language is not a recognized code.",
  },
  'html-xml-lang-mismatch': {
    fr: 'La page déclare sa langue deux fois avec des valeurs différentes.',
    en: 'The page declares its language twice with different values.',
  },
  'image-alt': {
    fr: "Une image informative n'a pas de texte alternatif.",
    en: 'An informative image has no alternative text.',
  },
  'input-button-name': {
    fr: "Un bouton de formulaire n'a pas d'intitulé.",
    en: 'A form button has no label.',
  },
  'input-image-alt': {
    fr: "Un bouton représenté par une image n'a pas de description.",
    en: 'A button shown as an image has no description.',
  },
  label: {
    fr: "Un champ de formulaire n'a pas de libellé accessible.",
    en: 'A form field has no accessible label.',
  },
  'label-content-name-mismatch': {
    fr: "Le nom annoncé aux technologies d'assistance ne reprend pas le texte visible d'un contrôle.",
    en: "The name announced to assistive technology omits a control's visible text.",
  },
  'link-in-text-block': {
    fr: 'Un lien dans un paragraphe ne se distingue du texte que par sa couleur.',
    en: 'A link inside a paragraph stands out from the text by colour alone.',
  },
  'link-name': {
    fr: "Un lien n'a pas de nom accessible.",
    en: 'A link has no accessible name.',
  },
  list: {
    fr: 'Une liste contient des éléments qui ne sont pas des entrées de liste.',
    en: 'A list contains elements that are not list items.',
  },
  listitem: {
    fr: 'Une entrée de liste se trouve hors de la liste qui doit la contenir.',
    en: 'A list item sits outside the list that should contain it.',
  },
  marquee: {
    fr: 'Un texte de la page défile automatiquement.',
    en: 'Some page text scrolls automatically.',
  },
  'meta-refresh': {
    fr: 'La page se recharge ou se redirige toute seule après un délai.',
    en: 'The page reloads or redirects itself after a delay.',
  },
  'meta-viewport': {
    fr: 'La page empêche le zoom sur mobile.',
    en: 'The page blocks zooming on mobile.',
  },
  'nested-interactive': {
    fr: "Un contrôle cliquable est placé à l'intérieur d'un autre contrôle.",
    en: 'A clickable control is placed inside another control.',
  },
  'no-autoplay-audio': {
    fr: "Un son démarre tout seul sans bouton d'arrêt accessible.",
    en: 'Audio starts on its own with no accessible stop button.',
  },
  'object-alt': {
    fr: "Un contenu embarqué n'a pas de description textuelle.",
    en: 'An embedded object has no text description.',
  },
  'p-as-heading': {
    fr: 'Un paragraphe est mis en forme comme un titre sans en être un.',
    en: 'A paragraph is styled like a heading without being one.',
  },
  'role-img-alt': {
    fr: "Un élément annoncé comme image n'a pas de description.",
    en: 'An element announced as an image has no description.',
  },
  'scrollable-region-focusable': {
    fr: "Une zone que l'on peut faire défiler n'est pas atteignable au clavier.",
    en: 'A scrollable area cannot be reached with a keyboard.',
  },
  'select-name': {
    fr: "Une liste déroulante n'a pas de nom accessible.",
    en: 'A dropdown list has no accessible name.',
  },
  'server-side-image-map': {
    fr: 'Une image cliquable gère ses liens côté serveur et ne répond pas au clavier.',
    en: 'An image map handles its links on the server and ignores the keyboard.',
  },
  'summary-name': {
    fr: "L'intitulé d'un bloc dépliable est vide.",
    en: "A collapsible block's summary is empty.",
  },
  'svg-img-alt': {
    fr: "Une image vectorielle n'a pas de description accessible.",
    en: 'A vector image has no accessible description.',
  },
  'table-fake-caption': {
    fr: "Le titre d'un tableau est une simple ligne au lieu d'un vrai titre de tableau.",
    en: "A table's title is an ordinary row instead of a real table caption.",
  },
  'target-size': {
    fr: 'Une cible interactive est trop petite ou trop rapprochée.',
    en: 'An interactive target is too small or too closely spaced.',
  },
  'td-has-header': {
    fr: "Une cellule d'un grand tableau n'est rattachée à aucun en-tête.",
    en: 'A cell in a large table is tied to no header.',
  },
  'td-headers-attr': {
    fr: "Une cellule de tableau pointe vers un en-tête qui n'existe pas.",
    en: 'A table cell points at a header that does not exist.',
  },
  'th-has-data-cells': {
    fr: 'Un en-tête de tableau ne décrit aucune cellule.',
    en: 'A table header describes no cells.',
  },
  'valid-lang': {
    fr: 'Un passage dans une autre langue déclare un code de langue non reconnu.',
    en: 'A passage in another language declares an unrecognized language code.',
  },
  'video-caption': {
    fr: "Une vidéo n'a pas de sous-titres.",
    en: 'A video has no captions.',
  },

  // Lighthouse performance and seo audits that can emit a finding.
  'bf-cache': {
    fr: 'Un retour arrière recharge la page entière au lieu de la restaurer aussitôt.',
    en: 'Going back reloads the whole page instead of restoring it instantly.',
  },
  'bootup-time': {
    fr: 'Le navigateur passe trop de temps à exécuter le code de la page au chargement.',
    en: "The browser spends too long running the page's code at load time.",
  },
  canonical: {
    fr: "L'adresse de référence déclarée par une page est invalide.",
    en: "A page's declared reference address is invalid.",
  },
  'cls-culprits-insight': {
    fr: 'Des éléments précis de la page se déplacent pendant le chargement.',
    en: 'Specific elements of the page shift around while it loads.',
  },
  'crawlable-anchors': {
    fr: 'Des liens de la page ne sont pas lisibles par les moteurs de recherche.',
    en: 'Some links on the page cannot be read by search engines.',
  },
  'cumulative-layout-shift': {
    fr: 'Des éléments de la page se déplacent pendant le chargement.',
    en: 'Page elements shift around while the page loads.',
  },
  'document-latency-insight': {
    fr: 'Le serveur met trop de temps à répondre à la toute première demande de la page.',
    en: "The server takes too long to answer the page's very first request.",
  },
  'dom-size-insight': {
    fr: "La page contient un nombre d'éléments très élevé qui la ralentit.",
    en: 'The page contains a very high number of elements, which slows it down.',
  },
  'duplicated-javascript-insight': {
    fr: 'Le même code de page est téléchargé plusieurs fois.',
    en: 'The same page code is downloaded more than once.',
  },
  'first-contentful-paint': {
    fr: "Le premier contenu visible de la page met trop de temps à s'afficher.",
    en: "The page's first visible content takes too long to appear.",
  },
  'forced-reflow-insight': {
    fr: 'Le code de la page force le navigateur à recalculer la mise en page en boucle.',
    en: "The page's code forces the browser to recalculate the layout repeatedly.",
  },
  hreflang: {
    fr: "Une annotation de langue déclarée par la page n'est pas valide.",
    en: 'A language annotation declared by the page is invalid.',
  },
  'http-status-code': {
    fr: 'Le serveur renvoie une réponse en erreur pour cette page.',
    en: 'The server returns an error response for this page.',
  },
  'image-delivery-insight': {
    fr: 'Des images sont servies dans un format ou à une taille qui alourdit la page.',
    en: 'Images are served in a format or at a size that weighs the page down.',
  },
  'inp-breakdown-insight': {
    fr: "La lenteur de la page à réagir aux clics vient d'une étape précise.",
    en: "The page's slow reaction to clicks comes from one identifiable step.",
  },
  'interaction-to-next-paint': {
    fr: 'La page met trop de temps à réagir à un clic ou à une saisie.',
    en: 'The page takes too long to react to a click or a keystroke.',
  },
  'is-crawlable': {
    fr: "Une directive technique empêche les moteurs de recherche d'indexer cette page.",
    en: 'A technical instruction stops search engines from indexing this page.',
  },
  'largest-contentful-paint': {
    fr: "Le plus grand élément visible de la page s'affiche trop lentement.",
    en: "The page's largest visible element appears too slowly.",
  },
  'layout-shifts': {
    fr: 'La mise en page bouge de façon inattendue pendant le chargement.',
    en: 'The layout moves unexpectedly while the page loads.',
  },
  'lcp-breakdown-insight': {
    fr: "L'affichage du plus grand élément de la page est retardé par une étape dominante.",
    en: "The largest element's appearance is delayed by one dominant step.",
  },
  'lcp-discovery-insight': {
    fr: "Le navigateur découvre l'image principale de la page trop tard.",
    en: "The browser discovers the page's main image too late.",
  },
  'legacy-javascript-insight': {
    fr: 'La page télécharge du code de compatibilité inutile pour les navigateurs récents.',
    en: 'The page downloads compatibility code that modern browsers do not need.',
  },
  'link-text': {
    fr: "Des liens utilisent un libellé générique qui n'indique pas leur destination.",
    en: 'Some links use generic wording that says nothing about their destination.',
  },
  'long-tasks': {
    fr: 'De longs traitements bloquent la page pendant le chargement.',
    en: 'Long-running tasks block the page while it loads.',
  },
  'mainthread-work-breakdown': {
    fr: 'Le navigateur effectue trop de travail au chargement, ce qui retarde la réactivité.',
    en: 'The browser does too much work at load time, which delays responsiveness.',
  },
  'meta-description': {
    fr: "Une page n'a pas de description pour les résultats de recherche.",
    en: 'A page has no description for search results.',
  },
  'modern-http-insight': {
    fr: 'Le serveur livre les fichiers du site avec une version ancienne du protocole web.',
    en: "The server delivers the site's files over an older version of the web protocol.",
  },
  'network-dependency-tree-insight': {
    fr: "Des fichiers du site se chargent en cascade, l'un après l'autre.",
    en: 'Some site files load in a cascade, one after another.',
  },
  'non-composited-animations': {
    fr: 'Des animations obligent le navigateur à redessiner la page à chaque image.',
    en: 'Animations force the browser to redraw the page on every frame.',
  },
  redirects: {
    fr: "Des liens passent par des redirections inutiles avant d'arriver à destination.",
    en: 'Some links pass through unnecessary redirects before reaching their destination.',
  },
  'robots-txt': {
    fr: "Le fichier qui guide l'exploration du site par les moteurs contient une erreur.",
    en: 'The file that guides search engines around the site contains an error.',
  },
  'server-response-time': {
    fr: 'Le serveur met trop de temps à répondre à la première demande.',
    en: 'The server takes too long to answer the first request.',
  },
  'speed-index': {
    fr: 'Le contenu visible de la page se remplit trop lentement pendant le chargement.',
    en: "The page's visible content fills in too slowly while it loads.",
  },
  'structured-data': {
    fr: "La page contient des données structurées dont la validité n'est pas établie.",
    en: 'The page carries structured data whose validity has not been established.',
  },
  'third-parties-insight': {
    fr: 'Des services extérieurs occupent une part importante du temps de chargement.',
    en: 'Outside services take up a large share of the loading time.',
  },
  'total-blocking-time': {
    fr: 'La page reste sourde aux clics pendant une partie du chargement.',
    en: 'The page stays unresponsive to clicks for part of its loading.',
  },
  'total-byte-weight': {
    fr: 'Le poids total téléchargé par la page est excessif.',
    en: 'The total weight downloaded by the page is excessive.',
  },
  'unminified-css': {
    fr: "Les fichiers de style du site arrivent chargés d'espaces et de commentaires inutiles.",
    en: "The site's stylesheet files arrive full of unnecessary spaces and comments.",
  },
  'unminified-javascript': {
    fr: "Les fichiers de code du site arrivent chargés d'espaces et de commentaires inutiles.",
    en: "The site's script files arrive full of unnecessary spaces and comments.",
  },
  'unsized-images': {
    fr: 'Des images de la page sont chargées sans dimensions déclarées.',
    en: 'Some page images load without declared dimensions.',
  },
  'unused-css-rules': {
    fr: 'Une partie des styles chargés par la page ne sert à rien.',
    en: 'Part of the styles the page loads serves no purpose.',
  },
  'unused-javascript': {
    fr: 'Une partie du code chargé par la page ne sert à rien.',
    en: 'Part of the code the page loads serves no purpose.',
  },
  'viewport-insight': {
    fr: "La configuration d'affichage mobile de la page n'est pas optimale.",
    en: "The page's mobile display configuration is not optimal.",
  },

  // Custom checks (CUSTOM_CHECK_SEVERITY).
  'accessibility-statement-missing': {
    fr: "Le site ne publie pas de déclaration d'accessibilité.",
    en: 'The site does not publish an accessibility statement.',
  },
  'ai-crawler-blocked': {
    fr: "Le site interdit l'accès à un robot d'assistant IA nommé.",
    en: 'The site blocks a named AI assistant crawler.',
  },
  'alt-text-quality-heuristic': {
    fr: "Le texte alternatif de certaines images semble ne pas décrire ce qu'elles montrent.",
    en: "Some images' alternative text seems not to describe what they show.",
  },
  'broken-internal-link': {
    fr: 'Un lien du site mène à une page qui ne charge pas.',
    en: 'A link on the site leads to a page that does not load.',
  },
  'canonical-conflicting': {
    fr: 'Une page déclare plusieurs adresses de référence contradictoires.',
    en: 'A page declares several conflicting reference addresses.',
  },
  'canonical-missing': {
    fr: 'Une page ne déclare pas son adresse de référence.',
    en: 'A page declares no reference address for itself.',
  },
  'canonical-target-noindex': {
    fr: "L'adresse de référence d'une page pointe vers une page exclue de l'indexation.",
    en: "A page's reference address points at a page excluded from indexing.",
  },
  'canonical-target-unreachable': {
    fr: "L'adresse de référence déclarée par une page ne répond pas.",
    en: 'The reference address a page declares does not respond.',
  },
  'consent-mechanism-absent': {
    fr: "Aucun mécanisme de consentement reconnu n'est détecté sur la page.",
    en: 'No recognized consent mechanism is detected on the page.',
  },
  'cookie-non-essential-before-consent': {
    fr: 'Des cookies de mesure ou de publicité sont déposés avant le choix du visiteur.',
    en: 'Analytics or advertising cookies are set before the visitor has chosen.',
  },
  'crux-cls-poor': {
    fr: 'De vrais visiteurs voient les éléments de la page bouger pendant le chargement.',
    en: "Real visitors see the page's elements move around while it loads.",
  },
  'crux-inp-poor': {
    fr: 'De vrais visiteurs attendent trop longtemps la réaction de la page à un clic.',
    en: 'Real visitors wait too long for the page to react to a click.',
  },
  'crux-lcp-poor': {
    fr: 'De vrais visiteurs vivent un chargement lent du contenu principal de la page.',
    en: "Real visitors experience slow loading of the page's main content.",
  },
  'entity-data-incomplete': {
    fr: "Les données structurées de l'établissement sont incomplètes.",
    en: "The property's structured data is incomplete.",
  },
  'faq-content-without-schema': {
    fr: "Une section de questions et réponses n'est pas déclarée comme telle aux moteurs.",
    en: 'A questions and answers section is not declared as such to search engines.',
  },
  'focus-order-mismatch': {
    fr: "L'ordre de navigation au clavier ne suit pas l'ordre du code de la page.",
    en: "The keyboard navigation order does not follow the order of the page's code.",
  },
  'form-error-not-associated': {
    fr: "Une erreur de formulaire visible n'est pas annoncée aux technologies d'assistance.",
    en: 'A visible form error is not exposed to assistive technology.',
  },
  'placeholder-only-label': {
    fr: "Un champ de formulaire n'a pour libellé que son texte indicatif, qui disparaît pendant la saisie.",
    en: 'A form field is named only by its placeholder, which disappears while typing.',
  },
  'heading-hierarchy-skip': {
    fr: 'La hiérarchie des titres de la page saute un niveau.',
    en: "The page's heading hierarchy skips a level.",
  },
  'hreflang-invalid': {
    fr: 'Une annotation de langue du site porte un code non reconnu.',
    en: "One of the site's language annotations carries an unrecognized code.",
  },
  'hreflang-target-invalid': {
    fr: 'Une annotation de langue du site pointe vers une page invalide.',
    en: 'A language annotation points to an invalid page.',
  },
  'hreflang-missing': {
    fr: 'Les versions linguistiques du site ne déclarent pas le lien entre elles.',
    en: "The site's language versions declare no link between one another.",
  },
  'hreflang-no-return-link': {
    fr: 'Une version linguistique ne renvoie pas vers la page qui la déclare.',
    en: 'One language version does not link back to the page that declares it.',
  },
  'html-structural-validity': {
    fr: 'Le code de la page contient des balises mal imbriquées ou des identifiants dupliqués.',
    en: "The page's markup contains badly nested tags or duplicated identifiers.",
  },
  'http-error-status': {
    fr: 'Le serveur répond par une erreur au lieu de la page attendue.',
    en: 'The server answers with an error instead of the expected page.',
  },
  'image-legacy-format': {
    fr: 'Des images utilisent un format ancien plus lourd que les formats récents.',
    en: 'Some images use an older format heavier than modern ones.',
  },
  'image-oversized': {
    fr: 'Des images sont servies nettement plus grandes que leur affichage réel.',
    en: 'Some images are served far larger than the space they are shown in.',
  },
  'jsonld-invalid': {
    fr: 'Un bloc de données structurées de la page contient une erreur de syntaxe.',
    en: "One of the page's structured-data blocks contains a syntax error.",
  },
  'jsonld-missing': {
    fr: 'Aucune donnée structurée ne décrit le contenu de la page pour les moteurs de recherche.',
    en: "No structured data describes the page's content for search engines.",
  },
  'keyboard-trap': {
    fr: 'La navigation au clavier reste bloquée sur un élément.',
    en: 'Keyboard navigation remains trapped on one element.',
  },
  'lcen-mentions-legales-missing': {
    fr: "Le numéro d'identification de l'entreprise est introuvable sur les pages visitées.",
    en: "The company's registration number cannot be found on the visited pages.",
  },
  'llms-txt-missing': {
    fr: 'Le site ne fournit pas le résumé facultatif lu par certains assistants de réponse.',
    en: 'The site does not provide the optional summary some answer assistants read.',
  },
  'meta-description-length': {
    fr: "La description d'une page est trop courte ou trop longue pour les résultats de recherche.",
    en: "A page's description is too short or too long for search results.",
  },
  'meta-description-missing': {
    fr: 'Une page ne fournit pas le résumé affiché sous son titre dans les résultats de recherche.',
    en: 'A page does not provide the summary shown under its title in search results.',
  },
  'meta-title-length': {
    fr: "Le titre d'une page est trop court ou trop long pour les résultats de recherche.",
    en: "A page's title is too short or too long for search results.",
  },
  'hreflang-target-language-mismatch': {
    fr: 'Un lien de langue annonce une traduction qui renvoie en réalité vers une page dans une autre langue.',
    en: 'A language link announces a translation that actually leads to a page in another language.',
  },
  'html-lang-content-mismatch': {
    fr: "Des pages annoncent une autre langue que celle de leur texte, ce qui fausse leur lecture par les lecteurs d'écran.",
    en: 'Pages declare another language than the one their text is written in, which garbles them for screen readers.',
  },
  'title-announces-error': {
    fr: 'Des pages avec un contenu portent un titre qui annonce une page introuvable, ce qui peut les écarter des résultats de recherche.',
    en: 'Pages with content carry a title announcing a missing page, which can keep them out of search results.',
  },
  'title-not-translated': {
    fr: "Des pages traduites gardent, dans les résultats de recherche, le titre non traduit de leur version d'origine.",
    en: 'Translated pages keep the untranslated title of their original version in search results.',
  },
  'meta-title-missing': {
    fr: "Une page n'a pas le titre qui s'affiche dans l'onglet du navigateur et dans les résultats de recherche.",
    en: 'A page lacks the title shown in the browser tab and in search results.',
  },
  'mixed-content': {
    fr: 'Une page sécurisée charge certains fichiers par une connexion non sécurisée.',
    en: 'A secure page loads some of its files over an insecure connection.',
  },
  'multiple-h1': {
    fr: 'Une page porte plusieurs titres principaux.',
    en: 'A page carries more than one main heading.',
  },
  'nap-phone-mismatch': {
    fr: 'Le numéro de téléphone déclaré aux moteurs ne figure pas sur la page.',
    en: 'The phone number declared to search engines does not appear on the page.',
  },
  'nap-postal-code-mismatch': {
    fr: "L'adresse déclarée aux moteurs ne correspond pas à celle affichée aux visiteurs.",
    en: 'The address declared to search engines does not match the one shown to visitors.',
  },
  'no-h1': {
    fr: "Une page n'a aucun titre principal.",
    en: 'A page has no main heading.',
  },
  'noindex-on-public-page': {
    fr: "Une page publique est tenue à l'écart des résultats de recherche par une directive technique.",
    en: 'A public page is kept out of search results by a technical instruction.',
  },
  'opengraph-missing': {
    fr: "La page ne déclare pas l'aperçu affiché lors d'un partage sur les réseaux sociaux.",
    en: 'The page declares no preview for shares on social networks.',
  },
  'redirect-chain-excessive': {
    fr: "Une adresse passe par plusieurs redirections successives avant d'arriver à destination.",
    en: 'An address passes through several successive redirects before arriving.',
  },
  'reflow-horizontal-scroll': {
    fr: 'Sur un écran étroit, la page oblige à faire défiler le contenu dans les deux sens.',
    en: 'On a narrow screen the page forces content to scroll in both directions.',
  },
  'robots-blocks-indexing': {
    fr: "Un réglage du site interdit aux moteurs de recherche de lire la page d'accueil.",
    en: 'A site setting stops search engines from reading the home page.',
  },
  'robots-disallow-broad': {
    fr: "Un réglage d'exploration bloque une grande partie des pages du site.",
    en: "A crawling setting blocks a large share of the site's pages.",
  },
  'security-header-missing-csp': {
    fr: "Le site ne limite pas encore les scripts que le navigateur accepte d'exécuter.",
    en: 'The site does not yet limit which scripts the browser will run.',
  },
  'security-header-missing-hsts': {
    fr: "Le site n'impose pas la connexion chiffrée aux visites suivantes.",
    en: 'The site does not enforce the encrypted connection on later visits.',
  },
  'security-header-missing-permissions-policy': {
    fr: "Le site ne déclare pas l'accès des composants tiers aux fonctions du navigateur.",
    en: "The site does not declare third-party components' access to browser features.",
  },
  'security-header-missing-referrer-policy': {
    fr: "Le site ne limite pas l'adresse d'origine transmise aux sites tiers lors d'un clic.",
    en: 'The site does not limit the origin address passed on to other sites when someone clicks.',
  },
  'security-header-missing-x-frame-options': {
    fr: "Le site peut être affiché à l'intérieur d'un autre site.",
    en: 'The site can be displayed inside another site.',
  },
  'sitemap-missing': {
    fr: 'Le site ne publie pas la liste de ses pages pour les moteurs de recherche.',
    en: 'The site publishes no list of its pages for search engines.',
  },
  'sitemap-orphan-page': {
    fr: "Une page listée par le site n'est reliée à aucune navigation interne.",
    en: 'A page listed by the site is connected to no internal navigation.',
  },
  'sitemap-lists-redirects': {
    fr: 'Le sitemap contient des adresses qui redirigent ou appartiennent à un autre site.',
    en: 'The sitemap contains addresses that redirect or belong to another site.',
  },
  'sitemap-lists-dead-urls': {
    fr: "Le plan du site contient des adresses qui n'existent plus.",
    en: 'The sitemap contains addresses that no longer exist.',
  },
  'sitemap-lists-noindex': {
    fr: 'Le sitemap soumet aux moteurs de recherche des pages qui demandent à ne pas être indexées.',
    en: 'The sitemap submits pages to search engines that ask not to be indexed.',
  },
  'sitemap-stale': {
    fr: 'La liste des pages déclarée par le site ne correspond plus au site publié.',
    en: "The site's declared page list no longer matches the published site.",
  },
  'relative-link-nesting': {
    fr: 'Un lien relatif construit une adresse imbriquée inattendue.',
    en: 'A relative link builds an unexpected nested address.',
  },
  'structured-data-entity-missing': {
    fr: "Aucune donnée structurée ne décrit clairement l'établissement.",
    en: 'No structured data clearly identifies the property.',
  },
  'structured-data-invalid': {
    fr: 'Les données structurées de la page manquent de champs que les moteurs attendent.',
    en: "The page's structured data is missing fields search engines expect.",
  },
  'third-party-data-transfer': {
    fr: 'La page sollicite plusieurs prestataires extérieurs dès son chargement.',
    en: 'The page contacts several outside providers as soon as it loads.',
  },
  'tracker-request-before-consent': {
    fr: "Des demandes partent vers des services de mesure ou de publicité dès l'ouverture de la page.",
    en: 'Requests go out to analytics or advertising services as soon as the page opens.',
  },
  'video-missing-captions': {
    fr: "Une vidéo porteuse de parole n'a pas de sous-titres.",
    en: 'A video carrying speech has no captions.',
  },
  'youtube-tracking-embed': {
    fr: 'La vidéo intégrée est servie par une version du lecteur qui dépose des cookies publicitaires.',
    en: 'The embedded video is served by a version of the player that sets advertising cookies.',
  },

  // Rule ids observed in real audits that neither the committed reachable list
  // nor the severity table contains. They stay covered the same way.
  'dom-size': {
    fr: "La page contient un nombre d'éléments très élevé qui la ralentit.",
    en: 'The page contains a very high number of elements, which slows it down.',
  },
  'font-display': {
    fr: 'Le texte de la page reste invisible pendant le chargement des polices.',
    en: 'Page text stays invisible while its fonts load.',
  },
  'lcp-lazy-loaded': {
    fr: "L'image principale de la page est retardée par un chargement différé.",
    en: "The page's main image is delayed by lazy loading.",
  },
  'legacy-javascript': {
    fr: 'La page télécharge du code de compatibilité inutile pour les navigateurs récents.',
    en: 'The page downloads compatibility code that modern browsers do not need.',
  },
  'offscreen-images': {
    fr: "Des images hors de l'écran au chargement retardent l'affichage du contenu utile.",
    en: 'Images sitting off-screen at load time delay the useful content.',
  },
  'prioritize-lcp-image': {
    fr: "L'image principale de la page n'est pas demandée en priorité par le navigateur.",
    en: "The browser does not request the page's main image as a priority.",
  },
  'render-blocking-resources': {
    fr: 'Des fichiers de style et de code retardent le premier affichage de la page.',
    en: "Style and script files delay the page's first render.",
  },
  'text-missing-from-raw-html': {
    fr: 'Une partie importante du contenu visible dépend de JavaScript.',
    en: 'A material part of the visible content depends on JavaScript.',
  },
  'third-party-summary': {
    fr: 'Des scripts venant de services extérieurs ralentissent la page.',
    en: 'Scripts from outside services slow the page down.',
  },
  'uses-http2': {
    fr: "La version du protocole en place fait charger les fichiers du site l'un après l'autre.",
    en: "The protocol version in place makes the site's files load one after another.",
  },
  'uses-long-cache-ttl': {
    fr: 'Des fichiers qui changent rarement sont retéléchargés à chaque visite.',
    en: 'Files that rarely change are downloaded again on every visit.',
  },
  'uses-rel-preconnect': {
    fr: 'La connexion vers des services extérieurs sollicités tôt démarre trop tard.',
    en: 'The connection to outside services contacted early starts too late.',
  },
  'uses-text-compression': {
    fr: 'Les fichiers texte du site sont transmis sans compression.',
    en: "The site's text files are sent uncompressed.",
  },
};
