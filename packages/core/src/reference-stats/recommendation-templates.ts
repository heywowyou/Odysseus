/**
 * Fixed remediation templates for SEO/GEO custom-check findings, keyed by
 * ruleId. Content, not a knob: hand-maintained here the same way
 * stats.ts's citation table is, never generated per report. Selection is
 * a pure function of ruleId (getRecommendationTemplates below) - every
 * template for a matched rule is returned, in the fixed array order
 * below, which is the priority order. This is fully deterministic on
 * purpose, the same way legalRelevance and citationByRank
 * (packages/report/src/template/sections/themes.ts) are: it needs no
 * LLM involvement to decide which template(s) apply to a given finding,
 * so it adds nothing to the locked llm-output.ts Theme schema. Any
 * future pass that wants the model to lightly tailor phrasing/ordering
 * around an already-selected template must not let it invent
 * remediation substance beyond what is written here (rule 1).
 *
 * Only ruleIds under FindingCategory 'seo' or 'geo' are covered.
 * Accessibility custom checks (keyboard-trap, video-missing-captions,
 * etc.) are out of scope for this table.
 *
 * Not yet wired into packages/llm or packages/report. Report wiring
 * needs a design decision this module does not make on its own: adding
 * a per-finding "Suggested next steps" block interacts with
 * docs/report/report-design-system.md's locked per-section data contract and
 * page-count invariants (section 12 Annexe's fixed shape, the 18-26
 * page stress-fixture bound), which is not this table's call to make
 * unilaterally.
 */

import { z } from 'zod';

const bilingualSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) });

export const recommendationTemplateSchema = z.object({
  id: z.string().min(1),
  text: bilingualSchema,
});
export type RecommendationTemplate = z.infer<typeof recommendationTemplateSchema>;

const RAW_TEMPLATES: Record<string, RecommendationTemplate[]> = {
  'robots-blocks-indexing': [
    {
      id: 'robots-blocks-indexing-remove-disallow',
      text: {
        fr: "Retirez ou corrigez la ligne Disallow du fichier robots.txt qui bloque la page d'accueil, puis vérifiez avec l'outil d'inspection d'URL de Google Search Console que la page est de nouveau explorable.",
        en: 'Remove or fix the Disallow line in robots.txt that blocks the homepage, then confirm with Google Search Console URL inspection that the page is crawlable again.',
      },
    },
  ],
  'noindex-on-public-page': [
    {
      id: 'noindex-on-public-page-remove-directive',
      text: {
        fr: "Retirez la balise meta robots noindex (ou l'en-tête X-Robots-Tag) de cette page si elle est censée apparaître dans les résultats de recherche.",
        en: 'Remove the meta robots noindex tag (or X-Robots-Tag header) from this page if it is meant to appear in search results.',
      },
    },
  ],
  'broken-internal-link': [
    {
      id: 'broken-internal-link-fix-target',
      text: {
        fr: "Corrigez le lien pour qu'il pointe vers l'URL actuelle et valide de la page cible.",
        en: "Update the link to point at the target page's current, valid URL.",
      },
    },
    {
      id: 'broken-internal-link-remove-link',
      text: {
        fr: "Si la page cible n'existe plus, retirez le lien plutôt que de le laisser pointer vers une page cassée.",
        en: 'If the target page no longer exists, remove the link rather than leaving it pointing at a broken page.',
      },
    },
  ],
  'redirect-chain-excessive': [
    {
      id: 'redirect-chain-excessive-point-at-final',
      text: {
        fr: "Mettez à jour les liens internes pour qu'ils pointent directement vers la destination finale, sans passer par les redirections intermédiaires.",
        en: 'Update internal links to point directly at the final destination, skipping the intermediate redirect hops.',
      },
    },
  ],
  'mixed-content': [
    {
      id: 'mixed-content-serve-https',
      text: {
        fr: "Chargez toutes les ressources (images, scripts, styles) via https:// plutôt que http:// pour éviter que le navigateur ne les bloque ou n'avertisse le visiteur.",
        en: 'Load every resource (images, scripts, styles) over https:// instead of http:// so the browser does not block or warn about them.',
      },
    },
  ],
  'http-error-status': [
    {
      id: 'http-error-status-fix-or-redirect',
      text: {
        fr: "Corrigez la page pour qu'elle réponde avec un code 200, ou mettez en place une redirection 301 vers une page équivalente si elle a été déplacée ou supprimée définitivement.",
        en: 'Fix the page to respond with a 200 status, or put a 301 redirect in place to an equivalent page if it was moved or permanently removed.',
      },
    },
  ],
  'meta-title-missing': [
    {
      id: 'meta-title-missing-add-unique-title',
      text: {
        fr: 'Ajoutez une balise <title> unique et descriptive à cette page, distincte du titre des autres pages du site.',
        en: 'Add a unique, descriptive <title> tag to this page, distinct from other pages on the site.',
      },
    },
  ],
  'meta-title-length': [
    {
      id: 'meta-title-length-fit-display-width',
      text: {
        fr: "Ajustez la longueur du titre pour qu'il s'affiche entièrement dans les résultats de recherche, généralement entre 50 et 60 caractères.",
        en: 'Adjust the title length so it displays in full in search results, typically 50 to 60 characters.',
      },
    },
  ],
  'meta-description-missing': [
    {
      id: 'meta-description-missing-add-summary',
      text: {
        fr: 'Ajoutez une balise de méta-description propre à cette page, résumant son contenu en une ou deux phrases.',
        en: 'Add a meta description tag specific to this page, summarizing its content in one or two sentences.',
      },
    },
  ],
  'meta-description-length': [
    {
      id: 'meta-description-length-fit-display-width',
      text: {
        fr: "Ajustez la longueur de la méta-description pour qu'elle s'affiche entièrement dans les résultats de recherche, généralement entre 120 et 160 caractères.",
        en: 'Adjust the meta description length so it displays in full in search results, typically 120 to 160 characters.',
      },
    },
  ],
  'canonical-missing': [
    {
      id: 'canonical-missing-add-self-referencing',
      text: {
        fr: 'Ajoutez une balise canonical, même auto-référente, pour indiquer explicitement quelle URL est la version de référence de cette page.',
        en: 'Add a canonical tag, even a self-referencing one, to explicitly state which URL is the authoritative version of this page.',
      },
    },
  ],
  'canonical-conflicting': [
    {
      id: 'canonical-conflicting-pick-one-target',
      text: {
        fr: 'Faites en sorte que toutes les balises canonical de cette page pointent vers la même URL cible.',
        en: 'Make every canonical tag on this page point at the same target URL.',
      },
    },
  ],
  'sitemap-missing': [
    {
      id: 'sitemap-missing-generate-and-submit',
      text: {
        fr: 'Générez un fichier sitemap.xml listant les pages importantes du site, et référencez-le dans le fichier robots.txt.',
        en: "Generate a sitemap.xml listing the site's important pages, and reference it from robots.txt.",
      },
    },
  ],
  'sitemap-stale': [
    {
      id: 'sitemap-stale-regenerate',
      text: {
        fr: "Régénérez le sitemap pour qu'il reflète les pages actuellement publiées sur le site, en retirant celles qui ont disparu et en ajoutant les nouvelles.",
        en: 'Regenerate the sitemap so it reflects the pages currently published on the site, removing ones that are gone and adding new ones.',
      },
    },
  ],
  'sitemap-lists-redirects': [
    {
      id: 'sitemap-lists-redirects-use-final-urls',
      text: {
        fr: 'Remplacez les URL redirigées ou externes du sitemap par les URL finales et canoniques appartenant au site.',
        en: 'Replace redirected or off-site sitemap URLs with the final canonical URLs belonging to the site.',
      },
    },
  ],
  'jsonld-missing': [
    {
      id: 'jsonld-missing-add-structured-data',
      text: {
        fr: 'Ajoutez un bloc de données structurées JSON-LD adapté au type de contenu de cette page (organisation, article, produit, etc.).',
        en: "Add a JSON-LD structured data block matching this page's content type (organization, article, product, and so on).",
      },
    },
  ],
  'jsonld-invalid': [
    {
      id: 'jsonld-invalid-fix-syntax',
      text: {
        fr: "Corrigez la syntaxe du bloc JSON-LD pour qu'il soit un JSON valide et conforme au schéma attendu, puis validez-le avec l'outil de test de résultats enrichis de Google.",
        en: "Fix the JSON-LD block's syntax so it is valid JSON matching the expected schema, then validate it with Google's Rich Results Test.",
      },
    },
  ],
  'hreflang-missing': [
    {
      id: 'hreflang-missing-add-tags',
      text: {
        fr: 'Ajoutez des balises hreflang indiquant les versions linguistiques disponibles de cette page.',
        en: 'Add hreflang tags stating the available language versions of this page.',
      },
    },
  ],
  'hreflang-invalid': [
    {
      id: 'hreflang-invalid-fix-language-codes',
      text: {
        fr: "Corrigez les codes de langue/région des balises hreflang pour qu'ils respectent le format ISO attendu (ex. fr-FR, en-US).",
        en: "Fix the hreflang tags' language/region codes to match the expected ISO format (e.g. fr-FR, en-US).",
      },
    },
  ],
  'hreflang-no-return-link': [
    {
      id: 'hreflang-no-return-link-add-reciprocal-tag',
      text: {
        fr: 'Ajoutez la balise hreflang réciproque sur la page cible, pointant en retour vers cette page.',
        en: 'Add the reciprocal hreflang tag on the target page, pointing back at this page.',
      },
    },
  ],
  'heading-hierarchy-skip': [
    {
      id: 'heading-hierarchy-skip-fix-order',
      text: {
        fr: 'Réorganisez les niveaux de titre pour ne pas sauter de niveau (par exemple un h3 ne doit pas suivre directement un h1 sans h2).',
        en: 'Reorder the heading levels so none are skipped (for example an h3 should not directly follow an h1 with no h2 in between).',
      },
    },
  ],
  'multiple-h1': [
    {
      id: 'multiple-h1-keep-one',
      text: {
        fr: "Ne conservez qu'un seul <h1> par page, correspondant au titre principal, et convertissez les autres en niveaux inférieurs.",
        en: 'Keep only one <h1> per page, matching the main heading, and demote the others to lower heading levels.',
      },
    },
  ],
  'no-h1': [
    {
      id: 'no-h1-add-main-heading',
      text: {
        fr: 'Ajoutez un <h1> décrivant le sujet principal de la page.',
        en: "Add an <h1> describing the page's main subject.",
      },
    },
  ],
  'opengraph-missing': [
    {
      id: 'opengraph-missing-add-tags',
      text: {
        fr: "Ajoutez les balises Open Graph de base (og:title, og:description, og:image) pour contrôler l'aperçu affiché lors du partage sur les réseaux sociaux.",
        en: 'Add the basic Open Graph tags (og:title, og:description, og:image) to control the preview shown when the page is shared on social platforms.',
      },
    },
  ],
  'image-oversized': [
    {
      id: 'image-oversized-compress-and-resize',
      text: {
        fr: "Compressez et redimensionnez l'image à la taille réellement affichée à l'écran, sans dépasser ce dont la mise en page a besoin.",
        en: 'Compress and resize the image to the size it is actually displayed at, no larger than the layout needs.',
      },
    },
    {
      id: 'image-oversized-serve-responsive',
      text: {
        fr: 'Proposez plusieurs tailles via srcset pour que chaque appareil télécharge une image adaptée à son écran.',
        en: 'Serve multiple sizes via srcset so each device downloads an image sized for its own screen.',
      },
    },
  ],
  'image-legacy-format': [
    {
      id: 'image-legacy-format-convert-modern-format',
      text: {
        fr: "Convertissez l'image en WebP ou AVIF, qui offrent une meilleure compression que JPEG/PNG à qualité visuelle équivalente.",
        en: 'Convert the image to WebP or AVIF, which compress better than JPEG/PNG at equivalent visual quality.',
      },
    },
  ],
  'lcen-mentions-legales-missing': [
    {
      id: 'lcen-mentions-legales-missing-publish-identifier',
      text: {
        fr: "Publiez les informations d'identification prévues par l'article 1-1, I, 2° de la LCEN sur une page de mentions légales identifiable, notamment le numéro SIREN ou RCS lorsqu'il est requis.",
        en: 'Publish the identification information specified by LCEN article 1-1, I, 2° on an identifiable legal notice page, including the SIREN or RCS number where required.',
      },
    },
  ],
  'canonical-target-unreachable': [
    {
      id: 'canonical-target-unreachable-fix-target',
      text: {
        fr: "Corrigez l'URL canonical pour qu'elle pointe vers une page qui répond correctement (code 200).",
        en: 'Fix the canonical URL so it points at a page that actually responds correctly (a 200 status).',
      },
    },
  ],
  'canonical-target-noindex': [
    {
      id: 'canonical-target-noindex-resolve-conflict',
      text: {
        fr: 'Faites correspondre les deux signaux: soit retirez le noindex de la page cible du canonical, soit changez la cible du canonical vers une page indexable.',
        en: 'Make the two signals agree: either remove noindex from the canonical target, or point the canonical at an indexable page instead.',
      },
    },
  ],
  'sitemap-orphan-page': [
    {
      id: 'sitemap-orphan-page-add-internal-link',
      text: {
        fr: "Ajoutez un lien interne vers cette page depuis une autre page du site, pour qu'elle ne dépende plus uniquement du sitemap pour être découverte.",
        en: 'Add an internal link to this page from elsewhere on the site, so it no longer depends solely on the sitemap for discovery.',
      },
    },
  ],
  'robots-disallow-broad': [
    {
      id: 'robots-disallow-broad-narrow-pattern',
      text: {
        fr: "Si le blocage n'est pas volontaire, réduisez le motif Disallow pour qu'il n'exclue que les pages réellement concernées (panier, admin, etc.).",
        en: 'If the block is not deliberate, narrow the Disallow pattern so it only excludes the pages actually meant to be blocked (cart, admin, and similar).',
      },
    },
  ],
  'llms-txt-missing': [
    {
      id: 'llms-txt-missing-add-file',
      text: {
        fr: 'Publiez un fichier llms.txt résumant le site pour les agents IA. Convention émergente et facultative: les études disponibles ne montrent pas encore de gain de citation mesurable, à traiter comme une opportunité, pas une urgence.',
        en: 'Publish an llms.txt file summarizing the site for AI agents. This is an emerging, optional convention; available studies show no measurable citation lift yet, so treat it as an opportunity, not an urgent fix.',
      },
    },
  ],
  'structured-data-entity-missing': [
    {
      id: 'structured-data-entity-missing-add-organization-schema',
      text: {
        fr: "Ajoutez un bloc de données structurées de type Organization (ou LocalBusiness) décrivant l'entreprise: nom, adresse, coordonnées.",
        en: 'Add an Organization (or LocalBusiness) structured data block describing the business: name, address, and contact details.',
      },
    },
  ],
  'entity-data-incomplete': [
    {
      id: 'entity-data-incomplete-fill-missing-fields',
      text: {
        fr: "Complétez le bloc d'entité existant avec les champs d'identification manquants (adresse, téléphone, horaires selon le cas).",
        en: 'Fill in the existing entity block with the missing identifying fields (address, phone, hours, as applicable).',
      },
    },
  ],
  'faq-content-without-schema': [
    {
      id: 'faq-content-without-schema-add-faqpage-schema',
      text: {
        fr: 'Ajoutez un balisage FAQPage correspondant aux questions déjà présentes sur la page, pour permettre leur extraction directe.',
        en: 'Add FAQPage markup matching the questions already present on the page, so they can be extracted directly.',
      },
    },
  ],
};

export const RECOMMENDATION_TEMPLATES: Readonly<Record<string, readonly RecommendationTemplate[]>> =
  Object.fromEntries(
    Object.entries(RAW_TEMPLATES).map(([ruleId, templates]) => [
      ruleId,
      templates.map((template) => recommendationTemplateSchema.parse(template)),
    ]),
  );

/**
 * Pure lookup. Returns every template for the given ruleId, in the fixed
 * priority order it is declared above, or an empty array for a ruleId
 * this table does not cover (including every accessibility ruleId,
 * deliberately out of scope here).
 */
export function getRecommendationTemplates(ruleId: string): readonly RecommendationTemplate[] {
  return RECOMMENDATION_TEMPLATES[ruleId] ?? [];
}
