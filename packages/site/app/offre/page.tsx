import type { Metadata } from 'next';
import { Dossier } from '../../lib/dossier';
import { LanguageSection, PageHeading } from '../../lib/language';
import { Reveal } from '../../lib/reveal';
import { Steps, type Step } from '../../lib/steps';

const description =
  'Les contrôles réalisés, le contenu du rapport, le délai et le tarif fixe de 1 600 € HT du diagnostic technique Odysseus.';

export const metadata: Metadata = {
  title: 'Le diagnostic technique Odysseus',
  description,
  alternates: { canonical: '/offre' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/offre',
    title: 'Le diagnostic technique Odysseus',
    description,
  },
};

const NEXT_STEPS_FR: readonly Step[] = [
  {
    title: 'Premier échange',
    text: 'Nous vous répondons personnellement pour vérifier que le diagnostic correspond bien à votre besoin.',
  },
  {
    title: 'Quelques questions',
    text: 'Un court questionnaire nous permet de comprendre votre site, votre activité et les éventuelles contraintes à prendre en compte.',
  },
  {
    title: 'Validation',
    text: 'Vous recevez une proposition écrite qui confirme le périmètre, le tarif et le délai. Rien ne démarre avant votre accord.',
  },
];

const NEXT_STEPS_EN: readonly Step[] = [
  {
    title: 'Initial conversation',
    text: 'We reply personally to make sure the diagnostic is a good fit for what you need.',
  },
  {
    title: 'A few questions',
    text: 'A short written questionnaire helps us understand your site, your business and any constraints we should take into account.',
  },
  {
    title: 'Approval',
    text: 'You receive a written proposal confirming the scope, price and delivery time. Nothing starts until you approve it.',
  },
];

export default function OfferPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="title measure"
          fr="Le diagnostic technique Odysseus"
          en="The Odysseus technical diagnostic"
        />
      </section>
      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                Un rapport qui vous montre quoi corriger, où intervenir et dans quel ordre, sur
                l&apos;ensemble de votre site.
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
                  Nous contacter
                </a>
              </div>
              <p className="small muted mt-4">
                Tarif fixe, confirmé par écrit avant tout engagement. Après correction, vous pouvez
                demander une nouvelle vérification au tarif de 450&#160;€&#160;HT. Elle est réalisée
                sous cinq jours ouvrés.
              </p>
            </div>

            <Dossier lang="fr" />
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="perimetre-offre" className="offer-section">
            <h2 id="perimetre-offre" className="heading">
              Les contrôles réalisés
            </h2>

            <Reveal className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibilité</h3>
                <p className="soft mt-3">
                  Les contrôles automatisables liés aux WCAG 2.2 niveau AA et à la norme européenne
                  EN 301 549 sont exécutés sur chaque page. Chaque écart détecté est rattaché à la
                  règle concernée et accompagné d&apos;une preuve.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">
                  Référencement naturel&#160;: HTML initial et rendu JavaScript
                </h3>
                <p className="soft mt-3">
                  Le HTML envoyé par le serveur est comparé à la page après exécution du JavaScript
                  dans un navigateur. Cette comparaison repère les contenus, liens ou métadonnées
                  qui dépendent du rendu JavaScript, sans présumer de la manière dont un moteur de
                  recherche donné les traitera.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Signaux techniques liés aux assistants IA</h3>
                <p className="soft mt-3">
                  Le diagnostic contrôle des signaux techniques vérifiables&#160;: les données
                  structurées déclarées par votre site, les règles d&apos;accès des robots
                  d&apos;indexation IA, le fichier llms.txt (une convention proposée pour présenter
                  aux agents IA les contenus importants d&apos;un site) et le balisage FAQ (des
                  données structurées indiquant qu&apos;une page répond à des questions fréquentes).
                  Il ne prédit pas si un assistant IA citera votre site, le classera, le
                  recommandera, ou répondra à une question sur votre activité.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance et en-têtes de sécurité</h3>
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
                      Réactivité aux interactions (INP, lorsque des données terrain sont
                      disponibles)
                    </p>
                    <p className="metric-desc">
                      La rapidité avec laquelle la page réagit aux interactions, lorsque des mesures
                      de visiteurs réels existent.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  Les performances sont mesurées en environnement contrôlé sur une sélection de
                  pages. Lorsqu&apos;elles sont disponibles, les données issues de visiteurs réels
                  viennent compléter ces mesures.
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
                Un rapport fondé sur des mesures
              </h2>
              <p className="soft mt-4">
                Le rapport vous est remis au format PDF, en français ou en anglais selon votre
                préférence. Son contenu suit trois règles simples.
              </p>
            </div>

            <Reveal className="method-grid mt-8">
              <div className="method-item">
                <p className="subheading">Chaque constat technique repose sur une mesure.</p>
                <p className="soft mt-2">
                  Le rapport s&apos;appuie uniquement sur les résultats des outils. Il les explique,
                  les hiérarchise et les traduit en actions compréhensibles, sans transformer une
                  mesure en supposition.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">Chaque constat indique où intervenir.</p>
                <p className="soft mt-2">
                  La page et l&apos;élément concernés sont indiqués précisément. Votre prestataire
                  peut vérifier le constat et remonter directement à la mesure d&apos;origine.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">
                  Le rapport ne se prononce pas sur vos obligations juridiques.
                </p>
                <p className="soft mt-2">
                  Il présente les textes et critères susceptibles de concerner votre activité, ainsi
                  que les données publiques disponibles sur votre entreprise. La détermination de
                  vos obligations juridiques reste du ressort d&apos;un professionnel du droit.
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
                Tous les contrôles de contenu prévus sont exécutés sur chaque page accessible à
                l&apos;outil. Les mesures de performance sont réalisées sur une sélection déterminée
                de pages, identifiée dans le rapport.
              </p>
            </div>
          </section>

          <section aria-labelledby="tarif-offre" className="offer-section">
            <div className="measure">
              <h2 id="tarif-offre" className="heading">
                Un tarif fixe
              </h2>
              <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
              <p className="soft mt-4">
                Le tarif ne dépend ni de la taille du site ni du nombre de constats. Il vous est
                confirmé par écrit avant tout engagement.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Nous contacter
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
        <section className="shell hero pt-0">
          <div className="split mt-10 hero-split">
            <div className="split-main">
              <p className="lede measure">
                A report that shows you what to fix, where to act and in what order across your
                entire website.
              </p>

              <Reveal className="measure mt-8">
                <div className="statement">
                  <p className="label">Scope of the diagnostic</p>
                  <p className="mt-2">
                    This is a technical diagnostic, not an RGAA audit. It does not produce an
                    official conformity rate and cannot serve as the basis for an accessibility
                    statement.
                  </p>
                </div>
              </Reveal>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="price numeric">EUR 1,600 excl. VAT</p>
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Contact us
                </a>
              </div>
              <p className="small muted mt-4">
                Fixed price, confirmed in writing before you commit to anything. After the fixes are
                made, you can request a new verification for EUR 450 excl. VAT, delivered within
                five business days.
              </p>
            </div>

            <Dossier lang="en" />
          </div>
        </section>

        <div className="shell section-tight">
          <section aria-labelledby="scope-offre-en" className="offer-section">
            <h2 id="scope-offre-en" className="heading">
              Checks performed
            </h2>

            <Reveal className="check-grid mt-8">
              <div className="check">
                <h3 className="subheading">Accessibility</h3>
                <p className="soft mt-3">
                  The automatable checks mapped to WCAG 2.2 Level AA and EN 301 549 are run on every
                  page. Each detected issue is tied to the relevant rule and backed by evidence.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Search&#160;: initial HTML and JavaScript rendering</h3>
                <p className="soft mt-3">
                  The HTML sent by the server is compared with the page after JavaScript has run in
                  a browser. This identifies content, links or metadata that depend on JavaScript
                  rendering without assuming how any particular search engine will handle them.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Technical signals for AI assistants</h3>
                <p className="soft mt-3">
                  The diagnostic checks verifiable technical signals&#160;: structured data declared
                  by your site, access rules for AI crawlers, the llms.txt file (a proposed
                  convention for presenting a site&apos;s important content to AI agents), and FAQ
                  markup (structured data indicating that a page answers common questions). It does
                  not predict whether an AI assistant will cite your site, rank it, recommend it, or
                  answer a question about your business.
                </p>
              </div>

              <div className="check">
                <h3 className="subheading">Performance and security headers</h3>
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
                      How quickly the page responds to interactions when measurements from real
                      visitors are available.
                    </p>
                  </div>
                </div>
                <p className="soft mt-4">
                  Performance is measured in a controlled environment on a selection of pages. Where
                  available, data from real visitors complements those measurements.
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
                A report grounded in measurements
              </h2>
              <p className="soft mt-4">
                The report is delivered as a PDF in French or English, according to your preference.
                Its content follows three simple rules.
              </p>
            </div>

            <Reveal className="method-grid mt-8">
              <div className="method-item">
                <p className="subheading">Every technical finding is backed by a measurement.</p>
                <p className="soft mt-2">
                  The report relies only on the results produced by the measurement tools. It
                  explains and prioritises them, then turns them into clear actions without turning
                  measurements into assumptions.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">Every finding tells you where to act.</p>
                <p className="soft mt-2">
                  The affected page and element are identified precisely. Your web provider can
                  verify the finding and trace it back to the underlying measurement.
                </p>
              </div>
              <div className="method-item">
                <p className="subheading">The report does not determine your legal obligations.</p>
                <p className="soft mt-2">
                  It presents the rules and criteria that may be relevant to your activity, together
                  with the public company data available. Determining your legal obligations remains
                  a matter for a qualified legal professional.
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
                Every content check in scope is run on every page the tool can access. Performance
                measurements are taken on a defined selection of pages, identified in the report.
              </p>
            </div>
          </section>

          <section aria-labelledby="price-offre-en" className="offer-section">
            <div className="measure">
              <h2 id="price-offre-en" className="heading">
                One fixed price
              </h2>
              <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
              <p className="soft mt-4">
                The price does not depend on the size of the site or the number of findings. It is
                confirmed in writing before you commit to anything.
              </p>
              <div className="mt-7">
                <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                  Contact us
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
