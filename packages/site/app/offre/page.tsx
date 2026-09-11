import type { Metadata } from 'next';
import { LanguageSection } from '../../lib/language';

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
 * La page n'affirme non plus aucune obligation légale. Savoir si une règle
 * donnée s'applique à une entreprise donnée est précisément la conclusion
 * que ce projet ne tire jamais.
 */
export default function OfferPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <p className="label">Offre</p>
          <h1 className="title measure mt-4">Diagnostic technique complet</h1>

          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                Un rapport qui dit quoi corriger, où, et dans quel ordre, sur l&apos;ensemble de
                votre site.
              </p>

              <div className="statement measure mt-8">
                <p className="label">Portée du diagnostic</p>
                <p className="mt-2">
                  Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de
                  conformité officiel et ne peut pas servir de base à une déclaration
                  d&apos;accessibilité.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="price numeric">1&#160;600&#160;€ HT</p>
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                  Écrire à Odysseus
                </a>
              </div>
              <p className="small muted mt-3">
                Tarif unique et publié, confirmé par écrit avant tout engagement. Une nouvelle
                vérification, si vous en demandez une après correction, est facturée
                450&#160;€&#160;HT, sous cinq jours ouvrés.
              </p>
              <p className="small muted mt-3">
                Un message lu personnellement, jamais par un système automatisé&#160;:{' '}
                <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
                  contact@odysseusaudit.com
                </a>
                .
              </p>
            </div>

            {/* La même fiche constat signature que la page d'accueil,
                condensée à trois rangées plutôt que cinq : le format
                illustré, jamais un résultat. Repère et preuve d'un côté,
                lecture et priorité réunies dans la rangée Action pour
                rester au même gabarit que la fiche d'accueil. */}
            <aside className="split-aside" aria-label="Ce que contient chaque constat">
              <div className="dossier">
                <div className="dossier-head">
                  <p className="dossier-title">Ce que contient chaque constat</p>
                  <p className="dossier-stamp">Rapport Odysseus</p>
                </div>
                <dl>
                  <div className="dossier-row">
                    <dt>Repérage</dt>
                    <dd>La page et l&apos;élément concernés, jamais noyés dans une moyenne.</dd>
                  </div>
                  <div className="dossier-row">
                    <dt>Preuve</dt>
                    <dd>
                      Une capture d&apos;écran ou la mesure qui établit le constat, vérifiable par
                      votre prestataire.
                    </dd>
                  </div>
                  <div className="dossier-row dossier-row-action">
                    <dt>Priorité et action</dt>
                    <dd>
                      Le problème expliqué pour un lecteur sans compétence technique, avec la
                      correction recommandée et son rang de priorité.
                    </dd>
                  </div>
                </dl>
                <p className="dossier-caption">
                  Illustration du format du rapport&#160;: elle ne représente ni un site réel, ni un
                  constat réel.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="perimetre-offre" className="offer-section">
            <h2 id="perimetre-offre" className="heading">
              Ce que le diagnostic vérifie
            </h2>

            <div className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibilité</h3>
                <p className="soft mt-3">
                  L&apos;ensemble des pages est confronté aux règles WCAG 2.2, niveau AA, et à la
                  norme européenne EN 301 549, élément par élément, avec la preuve de chaque écart.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Recherche et rendu</h3>
                <p className="soft mt-3">
                  Chaque page est chargée deux fois, sans JavaScript puis dans un navigateur
                  complet. Les écarts entre les deux versions montrent ce qu&apos;un moteur de
                  recherche reçoit à la place de votre contenu.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">
                  Signaux de visibilité dans les moteurs et assistants IA
                </h3>
                <p className="soft mt-3">
                  Le diagnostic vérifie des signaux techniques qui peuvent être établis&#160;: les
                  données structurées que votre site déclare, les règles d&apos;accès des robots
                  d&apos;indexation IA dans le fichier robots.txt, la présence d&apos;un fichier
                  llms.txt et du balisage FAQ. Il ne prédit pas si un assistant IA citera votre
                  site, le classera, le recommandera, ou répondra à une question sur votre activité.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance et sécurité</h3>
                <div className="metric-row mt-4">
                  <div className="metric">
                    <p className="metric-name">Chargement du contenu principal (LCP)</p>
                    <p className="metric-desc">
                      Le temps avant que l&apos;élément principal de la page soit affiché.
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
                      La vitesse à laquelle la page répond aux interactions, quand des mesures
                      réelles de visiteurs existent.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  La performance de laboratoire est mesurée sur un échantillon représentatif de
                  pages&#160;; les données terrain, lorsqu&apos;elles sont disponibles, viennent la
                  compléter.
                </p>
                <p className="soft mt-3">
                  Les en-têtes de sécurité du serveur sont vérifiés pour l&apos;ensemble du site,
                  indépendamment de la vitesse de chargement.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="livrable-offre" className="offer-section">
            <div className="measure">
              <h2 id="livrable-offre" className="heading">
                Rigueur du rapport
              </h2>
              <p className="soft mt-4">
                Un rapport au format PDF, remis en français et en anglais, au format présenté plus
                haut. Deux garanties encadrent son contenu.
              </p>
            </div>

            <div className="prose measure mt-8">
              <p>
                Le rapport ne contient que des constats effectivement relevés par les outils de
                mesure&#160;: l&apos;analyse les explique, les hiérarchise et les traduit, sans en
                ajouter aucun.
              </p>
              <p>
                Il reproduit également les critères réglementaires applicables à votre type
                d&apos;activité, ainsi que les données publiques du registre des entreprises, sans
                conclure à leur application à votre cas. Cette question relève d&apos;un avocat, ce
                que le rapport rappelle expressément.
              </p>
            </div>
          </section>

          <section aria-labelledby="couverture-offre" className="offer-section">
            <div className="measure">
              <h2 id="couverture-offre" className="heading">
                Couverture
              </h2>
              <p className="soft mt-4">
                Chaque page explorée avec succès reçoit les vérifications de contenu, quel que soit
                son rôle dans le site. La mesure de la performance porte sur un échantillon
                représentatif de pages&#160;; cette part d&apos;échantillonnage est annoncée comme
                telle dans le rapport.
              </p>
            </div>
          </section>

          <section aria-labelledby="tarif-offre" className="offer-section">
            <div className="measure">
              <p className="label">Tarif et contact</p>
              <h2 id="tarif-offre" className="heading mt-3">
                Un tarif unique et publié
              </h2>
              <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
              <p className="soft mt-4">
                Il ne dépend ni de la taille du site ni du nombre de constats, et il vous est
                confirmé par écrit avant tout engagement.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                  Écrire à Odysseus
                </a>
              </div>
              <p className="small muted mt-5">
                Pour toute question&#160;: contact@odysseusaudit.com.
              </p>
            </div>
          </section>

          <section aria-labelledby="suite-offre" className="offer-section">
            <div className="measure">
              <p className="label">Après votre message</p>
              <h2 id="suite-offre" className="heading mt-3">
                Trois étapes avant l&apos;audit
              </h2>
            </div>

            <ol className="process mt-9">
              <li>
                <p className="process-step">Réponse</p>
                <p className="soft mt-2">
                  Une personne lit votre message et vous répond, sans questionnaire automatisé.
                </p>
              </li>
              <li>
                <p className="process-step">Questionnaire</p>
                <p className="soft mt-2">
                  Un questionnaire écrit, huit à douze questions ciblées sur votre site et votre
                  activité.
                </p>
              </li>
              <li>
                <p className="process-step">Proposition écrite</p>
                <p className="soft mt-2">
                  Une proposition écrite confirmant le tarif et le délai, à valider avant tout
                  engagement.
                </p>
              </li>
            </ol>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <p className="label">Offer</p>
          <h1 className="title measure mt-4">The complete technical diagnostic</h1>

          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                A report that tells you what to fix, where, and in what order, across your whole
                site.
              </p>

              <div className="statement measure mt-8">
                <p className="label">Scope of the diagnostic</p>
                <p className="mt-2">
                  This is a technical diagnostic, not an audit RGAA. It does not produce an official
                  conformity rate and cannot serve as the basis for an accessibility statement.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="price numeric">EUR 1,600 excl. VAT</p>
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                  Write to Odysseus
                </a>
              </div>
              <p className="small muted mt-3">
                One published price, confirmed to you in writing before any commitment. A re-audit,
                if you request one after corrections, is billed at EUR 450 excl. VAT, within five
                business days.
              </p>
              <p className="small muted mt-3">
                Read personally, never by an automated system:{' '}
                <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
                  contact@odysseusaudit.com
                </a>
                .
              </p>
            </div>

            <aside className="split-aside" aria-label="What every finding contains">
              <div className="dossier">
                <div className="dossier-head">
                  <p className="dossier-title">What every finding contains</p>
                  <p className="dossier-stamp">Odysseus report</p>
                </div>
                <dl>
                  <div className="dossier-row">
                    <dt>Location</dt>
                    <dd>The page and the element concerned, never dissolved into an average.</dd>
                  </div>
                  <div className="dossier-row">
                    <dt>Evidence</dt>
                    <dd>
                      A screenshot or the measurement that establishes the finding, checkable by
                      your web provider.
                    </dd>
                  </div>
                  <div className="dossier-row dossier-row-action">
                    <dt>Priority and action</dt>
                    <dd>
                      The problem explained for a reader without a technical background, with the
                      recommended correction and its priority rank.
                    </dd>
                  </div>
                </dl>
                <p className="dossier-caption">
                  An illustration of the report format: it represents neither a real site nor a real
                  finding.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="scope-offre-en" className="offer-section">
            <h2 id="scope-offre-en" className="heading">
              What the diagnostic checks
            </h2>

            <div className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibility</h3>
                <p className="soft mt-3">
                  Every page is checked element by element against WCAG 2.2 level AA and the
                  European standard EN 301 549, with the evidence for every gap.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Search and rendering</h3>
                <p className="soft mt-3">
                  Every page is loaded twice, without JavaScript then in a full browser. The gaps
                  between the two versions show what a search engine receives in place of your
                  content.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">
                  AI visibility signals in search engines and assistants
                </h3>
                <p className="soft mt-3">
                  The diagnostic checks technical signals that can be verified: the structured data
                  your site declares, the AI-crawler access rules declared in robots.txt, the
                  presence of an llms.txt file and of FAQ markup. It does not predict whether an AI
                  assistant will cite your site, rank it, recommend it, or answer a question about
                  your business.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance and security</h3>
                <div className="metric-row mt-4">
                  <div className="metric">
                    <p className="metric-name">Largest contentful paint (LCP)</p>
                    <p className="metric-desc">
                      The time before the main element of the page is displayed.
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
                      How quickly the page responds to interactions, when real visitor measurements
                      exist.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  Lab performance is measured on a representative sample of pages; field data, when
                  available, supplements it.
                </p>
                <p className="soft mt-3">
                  The server&apos;s security headers are checked across the whole site,
                  independently of loading speed.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="deliverable-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="deliverable-offre-en" className="heading">
                Rigour of the report
              </h2>
              <p className="soft mt-4">
                A report in PDF format, delivered in French and English, in the format shown above.
                Two guarantees govern its content.
              </p>
            </div>

            <div className="prose measure mt-8">
              <p>
                The report contains only findings actually detected by the measuring tools: the
                analysis explains, prioritises and translates them, without adding any of its own.
              </p>
              <p>
                It also reproduces the regulatory criteria that apply to your type of activity,
                along with public business registry data, without concluding that they apply to your
                case. That question is for a lawyer, as the report expressly states.
              </p>
            </div>
          </section>

          <section aria-labelledby="coverage-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="coverage-offre-en" className="heading">
                Coverage
              </h2>
              <p className="soft mt-4">
                Every successfully crawled page receives the content checks, whatever its role in
                the site. Performance is measured on a representative sample of pages; that sampling
                is disclosed as such in the report.
              </p>
            </div>
          </section>

          <section aria-labelledby="price-offre-en" className="offer-section">
            <div className="measure">
              <p className="label">Price and contact</p>
              <h2 id="price-offre-en" className="heading mt-3">
                One published price
              </h2>
              <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
              <p className="soft mt-4">
                It does not depend on the size of the site or on the number of findings, and it is
                confirmed to you in writing before any commitment.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                  Write to Odysseus
                </a>
              </div>
              <p className="small muted mt-5">For any question: contact@odysseusaudit.com.</p>
            </div>
          </section>

          <section aria-labelledby="next-offre-en" className="offer-section">
            <div className="measure">
              <p className="label">After your message</p>
              <h2 id="next-offre-en" className="heading mt-3">
                Three steps before the audit
              </h2>
            </div>

            <ol className="process mt-9">
              <li>
                <p className="process-step">Reply</p>
                <p className="soft mt-2">
                  A person reads your message and replies, with no automated questionnaire.
                </p>
              </li>
              <li>
                <p className="process-step">Questionnaire</p>
                <p className="soft mt-2">
                  A written questionnaire, eight to twelve targeted questions about your site and
                  your business.
                </p>
              </li>
              <li>
                <p className="process-step">Written proposal</p>
                <p className="soft mt-2">
                  A written proposal confirming the price and the timeline, for you to approve
                  before any commitment.
                </p>
              </li>
            </ol>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
