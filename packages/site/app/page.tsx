import { Dossier } from '../lib/dossier';
import { Exhibit } from '../lib/exhibit';
import { LanguageSection, PageHeading } from '../lib/language';
import { Reveal } from '../lib/reveal';
import { AccessibilitySchematic, AiSignalsSchematic, RenderSchematic } from '../lib/schematics';
import { Steps, type Step } from '../lib/steps';

/**
 * Public homepage. French is the source language; English is written as
 * native copy rather than as a literal translation. Product claims remain
 * bounded to what the measurement pipeline can establish.
 */

const GUARANTEES_FR = [
  {
    claim: 'Chaque constat technique repose sur une mesure.',
    basis:
      'Le rapport s’appuie uniquement sur les résultats des outils. Il les explique, les hiérarchise et les traduit en actions compréhensibles, sans transformer une mesure en supposition.',
  },
  {
    claim: 'Chaque constat indique où intervenir.',
    basis:
      'La page et l’élément concernés sont indiqués précisément. Votre prestataire peut vérifier le constat et remonter directement à la mesure d’origine.',
  },
  {
    claim: 'Le rapport ne se prononce pas sur vos obligations juridiques.',
    basis:
      'Il présente les textes et critères susceptibles de concerner votre activité, ainsi que les données publiques disponibles sur votre entreprise. La détermination de vos obligations juridiques reste du ressort d’un professionnel du droit.',
  },
];

const GUARANTEES_EN = [
  {
    claim: 'Every technical finding is backed by a measurement.',
    basis:
      'The report relies only on the results produced by the measurement tools. It explains and prioritises them, then turns them into clear actions without turning measurements into assumptions.',
  },
  {
    claim: 'Every finding tells you where to act.',
    basis:
      'The affected page and element are identified precisely. Your web provider can verify the finding and trace it back to the underlying measurement.',
  },
  {
    claim: 'The report does not determine your legal obligations.',
    basis:
      'It presents the rules and criteria that may be relevant to your activity, together with the public company data available. Determining your legal obligations remains a matter for a qualified legal professional.',
  },
];

const HANDOFF_FR: readonly Step[] = [
  { title: 'Explorer', text: 'L’ensemble du site est parcouru et chaque page est mesurée.' },
  { title: 'Localiser', text: 'Chaque constat est rattaché à la page et à l’élément concernés.' },
  {
    title: 'Hiérarchiser',
    text: 'Les corrections sont classées de la plus urgente à la moins urgente.',
  },
  {
    title: 'Corriger',
    text: 'Votre prestataire dispose de tout ce qu’il faut pour vérifier chaque constat et appliquer les corrections.',
  },
];

const HANDOFF_EN: readonly Step[] = [
  { title: 'Explore', text: 'The whole site is crawled and every page is measured.' },
  { title: 'Locate', text: 'Every finding is tied to the affected page and element.' },
  { title: 'Prioritise', text: 'Corrections are ranked from most to least urgent.' },
  {
    title: 'Fix',
    text: 'Your web provider has the evidence needed to verify each finding and apply the correction.',
  },
];

export default function Home() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="display measure-display"
          fr="Un diagnostic pour passer du constat à la solution"
          en="A diagnostic that takes you from findings to fixes"
        />
      </section>
      <LanguageSection lang="fr">
        <HomeFr />
      </LanguageSection>
      <LanguageSection lang="en">
        <HomeEn />
      </LanguageSection>
    </main>
  );
}

function HomeFr() {
  return (
    <>
      <section className="shell hero pt-0">
        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede measure">
              Odysseus analyse l&apos;ensemble de votre site avec des outils de mesure automatisés
              et vous remet un rapport directement exploitable&#160;: chaque problème est localisé,
              documenté et classé par priorité, avec la correction recommandée.
            </p>

            <Reveal className="mt-8">
              <div className="statement">
                <p className="label">Portée du diagnostic</p>
                <p className="mt-2">
                  Ceci est un diagnostic technique, pas un audit RGAA. La portée exacte de cette
                  limite est précisée sur la page{' '}
                  <a className="evidence-link" href="/offre">
                    du diagnostic
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                Nous contacter
              </a>
              <a className="btn btn-secondary" href="/offre">
                Comprendre le diagnostic
              </a>
            </div>
            <p className="small muted mt-4 md:hidden">Tarif fixe&#160;: 1&#160;600&#160;€ HT.</p>
          </div>

          <Dossier lang="fr" />
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="recevez">
        <div className="measure">
          <h2 id="recevez" className="heading">
            Ce que vous recevez
          </h2>
          <p className="soft mt-4">
            Un rapport conçu pour passer directement de l&apos;analyse aux corrections.
          </p>
        </div>

        <Reveal className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">L&apos;ensemble du site analysé</p>
            <p className="soft mt-2">
              Tous les contrôles de contenu prévus sont exécutés sur chaque page accessible à
              l&apos;outil, quel que soit son rôle dans le site.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Des corrections classées par priorité</p>
            <p className="soft mt-2">
              Les constats sont ordonnés du plus urgent au moins urgent&#160;: vous savez par où
              commencer.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Un rapport lisible sans expertise technique</p>
            <p className="soft mt-2">
              L&apos;enjeu, la priorité et la difficulté de chaque correction sont expliqués
              simplement. Les détails techniques restent disponibles pour votre prestataire.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Chaque constat est vérifiable</p>
            <p className="soft mt-2">
              La page et l&apos;élément concernés sont indiqués précisément, avec la mesure
              correspondante. Votre prestataire peut vérifier le constat avant de le corriger.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="verifie">
        <div className="measure">
          <h2 id="verifie" className="heading">
            Les contrôles réalisés
          </h2>
          <p className="soft mt-4">
            Quatre familles de contrôles, limitées à ce que les outils de mesure peuvent établir.
          </p>
        </div>

        <div className="exhibits mt-10">
          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Accessibilité</h3>
              <p className="soft mt-3">
                Odysseus exécute sur chaque page les contrôles automatisables liés aux WCAG 2.2
                niveau AA et à la norme européenne EN 301 549. Chaque écart détecté est associé à la
                règle concernée et accompagné d&apos;une preuve.
              </p>
            </div>
            <AccessibilitySchematic lang="fr" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">
                Référencement naturel&#160;: HTML initial et rendu JavaScript
              </h3>
              <p className="soft mt-3">
                Chaque page est analysée sous deux formes&#160;: le HTML envoyé par le serveur, puis
                la page après exécution du JavaScript dans un navigateur. La comparaison permet
                d&apos;identifier les contenus, liens ou métadonnées qui dépendent du rendu
                JavaScript et peuvent être traités différemment selon les moteurs et les robots
                d&apos;indexation.
              </p>
            </div>
            <RenderSchematic lang="fr" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Signaux techniques liés aux assistants IA</h3>
              <p className="soft mt-3">
                Le diagnostic contrôle des signaux techniques vérifiables&#160;: les données
                structurées déclarées par votre site, les règles d&apos;accès des robots
                d&apos;indexation IA, le fichier llms.txt (une convention proposée pour présenter
                aux agents IA les contenus importants d&apos;un site) et le balisage FAQ (des
                données structurées indiquant qu&apos;une page répond à des questions fréquentes).
              </p>
              <p className="soft mt-3">
                Il ne prédit pas si un assistant IA citera votre site, le classera, le recommandera,
                ou répondra à une question sur votre activité.
              </p>
            </div>
            <AiSignalsSchematic lang="fr" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Performance et en-têtes de sécurité</h3>
              <p className="soft mt-3">
                Les performances sont mesurées en environnement contrôlé sur une sélection de
                pages&#160;; lorsqu&apos;elles sont disponibles, les données issues de visiteurs
                réels viennent compléter ces mesures.
              </p>
              <p className="soft mt-3">
                Les en-têtes de sécurité du serveur sont vérifiés sur l&apos;ensemble du site,
                indépendamment de la vitesse de chargement.
              </p>
            </div>
            <div className="exhibit-figure">
              <div className="metric-stack">
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
                    Réactivité aux interactions (INP, lorsque des données terrain sont disponibles)
                  </p>
                  <p className="metric-desc">
                    La rapidité avec laquelle la page réagit aux interactions, lorsque des mesures
                    de visiteurs réels existent.
                  </p>
                </div>
              </div>
            </div>
          </Exhibit>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="remise">
        <div className="measure">
          <h2 id="remise" className="heading">
            De l&apos;analyse à la correction
          </h2>
          <p className="soft mt-4">Quatre étapes, dans cet ordre.</p>
        </div>

        <Steps steps={HANDOFF_FR} className="mt-10" />
      </section>

      <section className="shell section section-divided" aria-labelledby="methode">
        <div className="measure">
          <h2 id="methode" className="heading">
            Des constats vérifiables
          </h2>
          <p className="soft mt-4">
            Le rapport suit trois règles simples&#160;: chaque constat doit être mesuré, localisé et
            vérifiable.
          </p>
        </div>

        <Reveal className="method-grid mt-9">
          {GUARANTEES_FR.map((guarantee) => (
            <div className="method-item" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft mt-2">{guarantee.basis}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="tarif">
        <div className="measure">
          <h2 id="tarif" className="heading">
            Un tarif fixe
          </h2>
          <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
          <p className="soft mt-4">
            Le tarif ne dépend ni de la taille du site ni du nombre de constats. Il vous est
            confirmé par écrit avant tout engagement.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
              Nous contacter
            </a>
            <a className="btn btn-secondary" href="/offre">
              Comprendre le diagnostic
            </a>
          </div>
          <p className="small muted mt-7">
            La manière dont Odysseus accède aux sites, et comment bloquer cet accès, sont décrites
            sur la page{' '}
            <a className="evidence-link" href="/bot">
              OdysseusBot
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}

function HomeEn() {
  return (
    <>
      <section className="shell hero pt-0">
        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede measure">
              Odysseus analyses your entire website with automated measurement tools and delivers a
              report you can act on immediately&#160;: every issue is located, documented and
              prioritised, with a recommended fix.
            </p>

            <Reveal className="mt-8">
              <div className="statement">
                <p className="label">Scope of the diagnostic</p>
                <p className="mt-2">
                  This is a technical diagnostic, not an RGAA audit. The exact scope of this
                  limitation is set out on the{' '}
                  <a className="evidence-link" href="/offre">
                    diagnostic page
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
                Contact us
              </a>
              <a className="btn btn-secondary" href="/offre">
                Understand the diagnostic
              </a>
            </div>
            <p className="small muted mt-4 md:hidden">Fixed price: EUR 1,600 excl. VAT.</p>
          </div>

          <Dossier lang="en" />
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="receive-en">
        <div className="measure">
          <h2 id="receive-en" className="heading">
            What you receive
          </h2>
          <p className="soft mt-4">
            A report designed to take you straight from analysis to fixes.
          </p>
        </div>

        <Reveal className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">The whole site analysed</p>
            <p className="soft mt-2">
              Every content check in scope is run on every page the tool can access, whatever its
              role in the site.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Corrections ranked by priority</p>
            <p className="soft mt-2">
              Findings are ordered from most to least urgent, so you know where to start.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">A report you can read without technical expertise</p>
            <p className="soft mt-2">
              The impact, priority and difficulty of each correction are explained clearly. The
              technical detail remains available for your web provider.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Every finding is verifiable</p>
            <p className="soft mt-2">
              The affected page and element are identified precisely, together with the relevant
              measurement. Your web provider can verify the finding before fixing it.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="checks-en">
        <div className="measure">
          <h2 id="checks-en" className="heading">
            Checks performed
          </h2>
          <p className="soft mt-4">
            Four groups of checks, limited to what the measurement tools can establish.
          </p>
        </div>

        <div className="exhibits mt-10">
          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Accessibility</h3>
              <p className="soft mt-3">
                Odysseus runs the automatable checks mapped to WCAG 2.2 Level AA and EN 301 549 on
                every page. Each detected issue is tied to the relevant rule and backed by evidence.
              </p>
            </div>
            <AccessibilitySchematic lang="en" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Search&#160;: initial HTML and JavaScript rendering</h3>
              <p className="soft mt-3">
                Each page is analysed in two forms&#160;: the HTML sent by the server, then the page
                after JavaScript has run in a browser. The comparison identifies content, links or
                metadata that depend on JavaScript rendering and may be handled differently by
                search engines and other indexing crawlers.
              </p>
            </div>
            <RenderSchematic lang="en" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Technical signals for AI assistants</h3>
              <p className="soft mt-3">
                The diagnostic checks verifiable technical signals&#160;: structured data declared
                by your site, access rules for AI crawlers, the llms.txt file (a proposed convention
                for presenting a site&apos;s important content to AI agents), and FAQ markup
                (structured data indicating that a page answers common questions).
              </p>
              <p className="soft mt-3">
                It does not predict whether an AI assistant will cite your site, rank it, recommend
                it, or answer a question about your business.
              </p>
            </div>
            <AiSignalsSchematic lang="en" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Performance and security headers</h3>
              <p className="soft mt-3">
                Performance is measured in a controlled environment on a selection of pages. Where
                available, data from real visitors is used to complement those measurements.
              </p>
              <p className="soft mt-3">
                The server&apos;s security headers are checked across the whole site, independently
                of loading speed.
              </p>
            </div>
            <div className="exhibit-figure">
              <div className="metric-stack">
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
            </div>
          </Exhibit>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="handoff-en">
        <div className="measure">
          <h2 id="handoff-en" className="heading">
            From analysis to correction
          </h2>
          <p className="soft mt-4">Four steps, in this order.</p>
        </div>

        <Steps steps={HANDOFF_EN} className="mt-10" />
      </section>

      <section className="shell section section-divided" aria-labelledby="method-en">
        <div className="measure">
          <h2 id="method-en" className="heading">
            Verifiable findings
          </h2>
          <p className="soft mt-4">
            The report follows three simple rules&#160;: every finding must be measured, located and
            verifiable.
          </p>
        </div>

        <Reveal className="method-grid mt-9">
          {GUARANTEES_EN.map((guarantee) => (
            <div className="method-item" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft mt-2">{guarantee.basis}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="price-en">
        <div className="measure">
          <h2 id="price-en" className="heading">
            One fixed price
          </h2>
          <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
          <p className="soft mt-4">
            The price does not depend on the size of the site or the number of findings. It is
            confirmed in writing before you commit to anything.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.fr">
              Contact us
            </a>
            <a className="btn btn-secondary" href="/offre">
              Understand the diagnostic
            </a>
          </div>
          <p className="small muted mt-7">
            How Odysseus accesses websites, and how to block that access, are explained on the{' '}
            <a className="evidence-link" href="/bot">
              OdysseusBot
            </a>{' '}
            page.
          </p>
        </div>
      </section>
    </>
  );
}
