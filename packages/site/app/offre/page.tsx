import type { Metadata } from 'next';
import { Dossier } from '../../lib/dossier';
import { LanguageSection } from '../../lib/language';
import { Reveal } from '../../lib/reveal';
import { Steps, type Step } from '../../lib/steps';

export const metadata: Metadata = {
  title: 'Diagnostic technique complet',
  description:
    'Ce que couvre le diagnostic technique complet Odysseus, ce que contient le rapport, et comment le recevoir. Le prix publié figure plus bas sur la page.',
  alternates: { canonical: '/offre' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/offre',
    title: 'Diagnostic technique complet',
    description:
      'Ce que couvre le diagnostic technique complet Odysseus, ce que contient le rapport, et comment le recevoir. Le prix publié figure plus bas sur la page.',
  },
};

/**
 * La page d'offre vers laquelle un aperçu renvoie, milestone 9c plan 009.
 *
 * Le contrat de l'aperçu exige un lien `offer` sur cet hôte : cette page doit
 * donc exister pour qu'un aperçu puisse être publié. La page elle-même
 * n'explique plus l'aperçu ni aucun mécanisme de prospection : une page
 * d'offre générale ne décrit pas un actif d'amorçage à froid, et plan 038
 * veut précisément qu'un changement d'implémentation de l'aperçu n'oblige
 * jamais à réécrire ce texte marketing.
 *
 * **Le prix est publié ici, par décision de l'opérateur du 2026-08-29.** Le
 * chiffre lui-même appartient à `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` dans
 * `packages/core` (trade-off 42), et cette page ne peut pas l'importer : le
 * site ne dépend délibérément d'aucun autre paquet du dépôt. Le chiffre est
 * donc répété en texte littéral, et `packages/core/src/offer/pricing.test.ts`
 * lit ce fichier et échoue si les deux divergent un jour, ou si une autre
 * somme en euros apparaît ici. Le garde-fou vit du côté qui possède le
 * chiffre, ce qui préserve l'isolation du site.
 *
 * Recast 2026-09-11, plan 038 : la page est réorganisée en page de décision.
 * La phrase de limitation approuvée (offer-positioning.md, section 2) reste
 * en tête de chaque langue, avant toute promesse détaillée. Le périmètre est
 * présenté en quatre entrées bornées, puis la liste concrète de ce que
 * contient chaque constat, puis la note de couverture qui distingue les
 * vérifications de contenu, conduites sur toutes les pages explorées avec
 * succès, de la mesure de performance, conduite sur un échantillon
 * représentatif annoncé comme tel (offer-positioning.md, section 3, et
 * trade-offs 64).
 *
 * Passe éditoriale du 2026-09-11 (opérateur) : bouton « Nous écrire », sans
 * la ligne de réassurance redondante placée dessous ; fiche constat
 * partagée avec l'accueil (lib/dossier.tsx) ; les trois mêmes principes que
 * l'accueil ; une seule mention factuelle des deux langues du rapport, qui
 * n'est plus présentée comme un argument de vente.
 *
 * La page n'affirme non plus aucune obligation légale. Savoir si une règle
 * donnée s'applique à une entreprise donnée est précisément la conclusion
 * que ce projet ne tire jamais.
 */
const NEXT_STEPS_FR: readonly Step[] = [
  { title: 'Réponse', text: 'Nous lisons votre message et vous répondons personnellement.' },
  {
    title: 'Questionnaire',
    text: 'Un questionnaire écrit de huit à douze questions, sur votre site et votre activité.',
  },
  {
    title: 'Proposition écrite',
    text: 'Une proposition écrite qui confirme le tarif et le délai, à valider avant tout engagement.',
  },
];

const NEXT_STEPS_EN: readonly Step[] = [
  { title: 'Reply', text: 'We read your message and reply to you personally.' },
  {
    title: 'Questionnaire',
    text: 'A written questionnaire of eight to twelve questions, about your site and your business.',
  },
  {
    title: 'Written proposal',
    text: 'A written proposal confirming the price and the timeline, for you to approve before any commitment.',
  },
];

export default function OfferPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <h1 className="title measure">Diagnostic technique complet</h1>

          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                Un rapport qui dit quoi corriger, où, et dans quel ordre, sur l&apos;ensemble de
                votre site.
              </p>

              <Reveal className="measure mt-8">
                <div className="statement">
                  <p className="label">Portée du diagnostic</p>
                  <p className="mt-2">
                    Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux
                    de conformité officiel et ne peut pas servir de base à une déclaration
                    d&apos;accessibilité.
                  </p>
                </div>
              </Reveal>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="price numeric">1&#160;600&#160;€ HT</p>
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Nous écrire
                </a>
              </div>
              <p className="small muted mt-4">
                Tarif unique et publié, confirmé par écrit avant tout engagement. Une fois vos
                corrections faites, une nouvelle vérification peut être réalisée sur demande, pour
                450&#160;€&#160;HT, sous cinq jours ouvrés.
              </p>
            </div>

            <Dossier lang="fr" />
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="perimetre-offre" className="offer-section">
            <h2 id="perimetre-offre" className="heading">
              Ce que le diagnostic vérifie
            </h2>

            <Reveal className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibilité</h3>
                <p className="soft mt-3">
                  Élément par élément, au regard de la norme WCAG 2.2 niveau AA et de la norme
                  européenne EN 301 549, avec preuve à l&apos;appui de chaque écart relevé.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Recherche et rendu</h3>
                <p className="soft mt-3">
                  Chaque page est comparée telle que reçue par un moteur de recherche sans
                  JavaScript, et telle qu&apos;affichée dans un navigateur complet, pour repérer ce
                  que le premier manque du second.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">
                  Signaux de visibilité dans les moteurs et assistants IA
                </h3>
                <p className="soft mt-3">
                  Le diagnostic contrôle des signaux techniques vérifiables&#160;: les données
                  structurées déclarées par votre site, les règles d&apos;accès des robots
                  d&apos;indexation IA, le fichier llms.txt (un fichier que certains assistants IA
                  consultent avant d&apos;explorer un site) et le balisage FAQ (des données qui
                  signalent qu&apos;une page répond à des questions courantes). Il ne prédit pas si
                  un assistant IA citera votre site, le classera, le recommandera, ou répondra à une
                  question sur votre activité.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance et sécurité</h3>
                <div className="metric-row mt-4">
                  <div className="metric">
                    <p className="metric-name">Chargement du contenu principal (LCP)</p>
                    <p className="metric-desc">
                      Le temps nécessaire à l&apos;affichage de l&apos;élément principal de la page.
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric-name">Stabilité visuelle (CLS)</p>
                    <p className="metric-desc">
                      Les déplacements inattendus de la mise en page pendant le chargement.
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric-name">
                      Réactivité réelle (INP, lorsque des données terrain sont disponibles)
                    </p>
                    <p className="metric-desc">
                      La rapidité avec laquelle la page réagit aux interactions, lorsque des mesures
                      de visiteurs réels existent.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  La performance de laboratoire est mesurée sur un échantillon représentatif de
                  pages&#160;; les données terrain, lorsqu&apos;elles existent, viennent la
                  compléter.
                </p>
                <p className="soft mt-3">
                  Les en-têtes de sécurité du serveur sont vérifiés sur l&apos;ensemble du site,
                  indépendamment de la vitesse de chargement.
                </p>
              </div>
            </Reveal>
          </section>

          <section aria-labelledby="livrable-offre" className="offer-section">
            <div className="measure">
              <h2 id="livrable-offre" className="heading">
                Rigueur du rapport
              </h2>
              <p className="soft mt-4">
                Le rapport vous est remis au format PDF, en français ou en anglais selon votre
                préférence. Trois principes encadrent son contenu.
              </p>
            </div>

            <Reveal className="method-grid mt-8">
              <div className="method-item">
                <p className="subheading">Chaque constat provient d&apos;un test.</p>
                <p className="soft mt-2">
                  Les constats sont établis par des outils de mesure. La rédaction du rapport repose
                  exclusivement sur leurs résultats&#160;: elle les explique, les hiérarchise et les
                  formule en langage clair, sans rien y ajouter.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">Chaque constat est localisé.</p>
                <p className="soft mt-2">
                  Il indique la page et l&apos;élément concernés. Votre prestataire peut ainsi le
                  vérifier en quelques instants, sans avoir à nous croire sur parole.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">
                  Le rapport ne se prononce pas sur vos obligations légales.
                </p>
                <p className="soft mt-2">
                  Il reproduit les critères réglementaires applicables à votre type d&apos;activité
                  et les données publiques du registre des entreprises, sans conclure à leur
                  application à votre cas. Cette appréciation relève d&apos;un avocat, ce que le
                  rapport rappelle expressément.
                </p>
              </div>
            </Reveal>
          </section>

          <section aria-labelledby="couverture-offre" className="offer-section">
            <div className="measure">
              <h2 id="couverture-offre" className="heading">
                Couverture
              </h2>
              <p className="soft mt-4">
                Chaque page explorée avec succès fait l&apos;objet de toutes les vérifications de
                contenu, quel que soit son rôle dans le site. La performance est mesurée sur un
                échantillon représentatif de pages, ce que le rapport indique explicitement.
              </p>
            </div>
          </section>

          <section aria-labelledby="tarif-offre" className="offer-section">
            <div className="measure">
              <h2 id="tarif-offre" className="heading">
                Un tarif unique et publié
              </h2>
              <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
              <p className="soft mt-4">
                Il ne dépend ni de la taille du site ni du nombre de constats, et il vous est
                confirmé par écrit avant tout engagement.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Nous écrire
                </a>
              </div>
            </div>
          </section>

          <section aria-labelledby="suite-offre" className="offer-section">
            <div className="measure">
              <h2 id="suite-offre" className="heading">
                Trois étapes avant le diagnostic
              </h2>
            </div>

            <Steps steps={NEXT_STEPS_FR} className="mt-9" />
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <h1 className="title measure">The complete technical diagnostic</h1>

          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                A report that tells you what to fix, where, and in what order, across your whole
                site.
              </p>

              <Reveal className="measure mt-8">
                <div className="statement">
                  <p className="label">Scope of the diagnostic</p>
                  <p className="mt-2">
                    This is a technical diagnostic, not an audit RGAA. It does not produce an
                    official conformity rate and cannot serve as the basis for an accessibility
                    statement.
                  </p>
                </div>
              </Reveal>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="price numeric">EUR 1,600 excl. VAT</p>
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Write to us
                </a>
              </div>
              <p className="small muted mt-4">
                One published price, confirmed to you in writing before any commitment. Once your
                corrections are made, a new check can be run on request, for EUR 450 excl. VAT,
                within five business days.
              </p>
            </div>

            <Dossier lang="en" />
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="scope-offre-en" className="offer-section">
            <h2 id="scope-offre-en" className="heading">
              What the diagnostic checks
            </h2>

            <Reveal className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibility</h3>
                <p className="soft mt-3">
                  Element by element, against WCAG 2.2 level AA and the European standard EN 301
                  549, with evidence attached to every gap found.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Search and rendering</h3>
                <p className="soft mt-3">
                  Each page is compared as a search engine receives it without JavaScript against
                  how it appears in a full browser, to find what the first one misses of the second.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">
                  AI visibility signals in search engines and assistants
                </h3>
                <p className="soft mt-3">
                  The diagnostic checks technical signals that can be verified: the structured data
                  your site declares, the access rules for AI crawlers, the llms.txt file (a file
                  some AI assistants check before crawling a site) and FAQ markup (data that marks a
                  page as answering common questions). It does not predict whether an AI assistant
                  will cite your site, rank it, recommend it, or answer a question about your
                  business.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance and security</h3>
                <div className="metric-row mt-4">
                  <div className="metric">
                    <p className="metric-name">Largest contentful paint (LCP)</p>
                    <p className="metric-desc">
                      The time it takes to display the main element of the page.
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric-name">Cumulative layout shift (CLS)</p>
                    <p className="metric-desc">
                      Unexpected movements of the layout while the page loads.
                    </p>
                  </div>
                  <div className="metric">
                    <p className="metric-name">
                      Interaction to next paint (INP, when field data is available)
                    </p>
                    <p className="metric-desc">
                      How quickly the page responds to interactions, when measurements from real
                      visitors exist.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  Lab performance is measured on a representative sample of pages; field data, where
                  it exists, supplements it.
                </p>
                <p className="soft mt-3">
                  The server&apos;s security headers are checked across the whole site,
                  independently of loading speed.
                </p>
              </div>
            </Reveal>
          </section>

          <section aria-labelledby="deliverable-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="deliverable-offre-en" className="heading">
                Rigour of the report
              </h2>
              <p className="soft mt-4">
                The report is delivered as a PDF, in French or English as you prefer. Three
                principles govern its content.
              </p>
            </div>

            <Reveal className="method-grid mt-8">
              <div className="method-item">
                <p className="subheading">Every finding comes from a test.</p>
                <p className="soft mt-2">
                  Findings are established by measuring tools. The writing of the report relies
                  exclusively on their results: it explains them, ranks them and puts them into
                  plain language, without adding anything.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">Every finding is located.</p>
                <p className="soft mt-2">
                  It names the page and the element concerned. Your web provider can check it in
                  moments, without having to take our word for it.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">The report does not rule on your legal obligations.</p>
                <p className="soft mt-2">
                  It reproduces the regulatory criteria that apply to your type of activity and the
                  public business registry data, without concluding that they apply to your case.
                  That assessment is for a lawyer, as the report expressly states.
                </p>
              </div>
            </Reveal>
          </section>

          <section aria-labelledby="coverage-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="coverage-offre-en" className="heading">
                Coverage
              </h2>
              <p className="soft mt-4">
                Every successfully crawled page receives all the content checks, whatever its role
                in the site. Performance is measured on a representative sample of pages, which the
                report states explicitly.
              </p>
            </div>
          </section>

          <section aria-labelledby="price-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="price-offre-en" className="heading">
                One published price
              </h2>
              <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
              <p className="soft mt-4">
                It does not depend on the size of the site or on the number of findings, and it is
                confirmed to you in writing before any commitment.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Write to us
                </a>
              </div>
            </div>
          </section>

          <section aria-labelledby="next-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="next-offre-en" className="heading">
                Three steps before the diagnostic
              </h2>
            </div>

            <Steps steps={NEXT_STEPS_EN} className="mt-9" />
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
