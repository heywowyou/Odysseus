import type { Metadata } from 'next';
import { LanguageSection } from '../../lib/language';

export const metadata: Metadata = {
  title: "L'audit complet",
  description: "Ce que couvre l'audit Odysseus, ce qu'il produit, et comment le commander.",
  alternates: { canonical: '/offre' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/offre',
    title: "L'audit complet",
    description: "Ce que couvre l'audit Odysseus, ce qu'il produit, et comment le commander.",
  },
};

/**
 * La page d'offre vers laquelle un aperçu renvoie, milestone 9c plan 009.
 *
 * Le contrat de l'aperçu exige un lien `offer` sur cet hôte : cette page doit
 * donc exister pour qu'un aperçu puisse être publié.
 *
 * **Le prix est publié ici, par décision de l'opérateur du 2026-08-29.** Le
 * chiffre lui-même appartient à `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` dans
 * `packages/core` (trade-off 42), et cette page ne peut pas l'importer : le
 * site ne dépend délibérément d'aucun autre paquet du dépôt. Le chiffre est
 * donc répété en texte littéral, et `packages/core/src/offer/pricing.test.ts`
 * lit ce fichier et échoue si les deux divergent un jour. Le garde-fou vit du
 * côté qui possède le chiffre, ce qui préserve l'isolation du site.
 *
 * La page n'affirme non plus aucune obligation légale. Savoir si une règle
 * donnée s'applique à une entreprise donnée est précisément la conclusion
 * que ce projet ne tire jamais.
 *
 * La phrase de limitation approuvée, section 2 de offer-positioning.md, est
 * énoncée en tête de chaque langue, avant toute promesse.
 *
 * Réécriture éditoriale du 2026-09-10&#160;: texte français rédigé
 * nativement, colonne anglaise traduite du français.
 *
 * Bascule de langue du 2026-09-10&#160;: les deux langues occupaient jusque
 * là deux colonnes toujours visibles côte à côte, avec des liens
 * d'ancrage qui faisaient semblant de « changer » de langue en défilant vers
 * un contenu déjà affiché. La page entière (accroche comprise) est
 * désormais dupliquée dans `LanguageSection`, pilotée par le vrai
 * sélecteur du bandeau (`lib/site-chrome.tsx`) : une seule langue est
 * visible à la fois, dans tout le document, pas seulement dans le corps.
 *
 * Mise à jour du 2026-09-11 (plan 037)&#160;: l'aperçu n'est plus limité à
 * trois pages, il repose sur une analyse de l'ensemble du site dont il ne
 * montre qu'une synthèse. L'audit complet reste établi à partir d'une
 * nouvelle analyse, jamais de l'analyse ayant servi à l'aperçu.
 */
export default function OfferPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <p className="label">Offre</p>
          <h1 className="title measure mt-4">L&apos;audit complet</h1>
          <p className="lede measure mt-5">
            L&apos;analyse de l&apos;ensemble de votre site, et un rapport qui précise, pour chaque
            constat, la page et l&apos;élément concernés.
          </p>

          <div className="statement measure mt-8">
            <p className="label">Portée du diagnostic</p>
            <p className="mt-2">
              Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de
              conformité officiel et ne peut pas servir de base à une déclaration
              d&apos;accessibilité.
            </p>
          </div>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Si vous avez reçu un aperçu, celui-ci repose sur une analyse de l&apos;ensemble du
              site, dont il ne montre qu&apos;une synthèse&#160;: des totaux et quelques constats
              résumés, sans détail technique. L&apos;audit complet est établi à partir d&apos;une
              nouvelle analyse de votre site, et lui seul détaille chaque constat.
            </p>

            <h2>Périmètre</h2>

            <ul>
              <li>
                L&apos;accessibilité, au regard des règles WCAG 2.2, niveau AA, et de la norme
                européenne EN 301 549.
              </li>
              <li>
                Le référencement naturel, notamment les écarts entre la page brute et la page après
                exécution du JavaScript, qui peuvent rendre une grande partie d&apos;un site
                invisible aux moteurs de recherche.
              </li>
              <li>La visibilité auprès des assistants d&apos;intelligence artificielle (IA).</li>
              <li>
                La vitesse de chargement, mesurée sur un échantillon représentatif de pages, les
                données structurées et les en-têtes de sécurité.
              </li>
            </ul>

            <h2>Livrable</h2>

            <p>
              Un rapport au format PDF, en français et en anglais. Chaque constat renvoie à la page
              et à l&apos;élément concernés, et s&apos;accompagne d&apos;une capture d&apos;écran,
              d&apos;une explication du problème et d&apos;une recommandation de correction. Le
              rapport ne contient que des constats effectivement relevés par les outils de
              mesure&#160;: l&apos;analyse les explique, les hiérarchise et les traduit, sans en
              ajouter aucun.
            </p>

            <p>
              Le rapport reproduit également les critères réglementaires applicables à votre type
              d&apos;activité, ainsi que les données publiques du registre des entreprises, sans
              conclure à leur application à votre cas. Cette question relève d&apos;un avocat, ce
              que le rapport rappelle expressément.
            </p>

            <h2>Commande</h2>
          </section>

          <div className="card card-accent measure mt-6">
            <p className="label">Tarif unique et publié</p>
            <p className="price mt-3">1&#160;600&#160;€ HT</p>
            <p className="soft mt-4">
              Il ne dépend ni de la taille du site ni du nombre de constats, et vous est confirmé
              par écrit avant tout engagement. Pour commander ou pour toute question&#160;:
              contact@odysseusaudit.com.
            </p>
            <a className="btn btn-primary mt-6" href="mailto:contact@odysseusaudit.com">
              Commander par e-mail
            </a>
          </div>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <p className="label">Offer</p>
          <h1 className="title measure mt-4">The full audit</h1>
          <p className="lede measure mt-5">
            An analysis of your whole site, and a report that names, for every finding, the page and
            the element concerned.
          </p>

          <div className="statement measure mt-8">
            <p className="label">Scope of the diagnostic</p>
            <p className="mt-2">
              This is a technical diagnostic, not an audit RGAA. It does not produce an official
              conformity rate and cannot serve as the basis for an accessibility statement.
            </p>
          </div>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              If you received a preview, it was built from an analysis of the whole site, of which
              it shows only a summary: totals and a few summarised findings, with no technical
              detail. The full audit runs from a fresh analysis of your site, and it alone sets out
              every finding in detail.
            </p>

            <h2>Scope</h2>

            <ul>
              <li>
                Accessibility, checked against WCAG 2.2 level AA and the European standard EN 301
                549.
              </li>
              <li>
                Technical search optimisation, including the gaps between the raw page and the page
                once JavaScript has run, which can leave a large part of a site invisible to search
                engines.
              </li>
              <li>Visibility to artificial intelligence (AI) assistants.</li>
              <li>
                Loading speed, measured on a representative sample of pages, structured data, and
                security headers.
              </li>
            </ul>

            <h2>Deliverable</h2>

            <p>
              A report in PDF format, in French and English. Every finding points to the page and
              the element concerned, with a screenshot, an explanation of the problem, and a
              recommendation for fixing it. The report contains only findings actually detected by
              the measuring tools: the analysis explains, prioritises and translates them, without
              adding any of its own.
            </p>

            <p>
              The report also reproduces the regulatory criteria that apply to your type of
              activity, along with public business registry data, without concluding that they apply
              to your case. That question is for a lawyer, as the report expressly states.
            </p>

            <h2>Ordering</h2>
          </section>

          <div className="card card-accent measure mt-6">
            <p className="label">One published price</p>
            <p className="price mt-3">EUR 1,600 excl. VAT</p>
            <p className="soft mt-4">
              It does not depend on the size of the site or on the number of findings, and it is
              confirmed to you in writing before any commitment. To order or for any question:
              contact@odysseusaudit.com.
            </p>
            <a className="btn btn-primary mt-6" href="mailto:contact@odysseusaudit.com">
              Order by email
            </a>
          </div>
        </div>
      </LanguageSection>
    </main>
  );
}
