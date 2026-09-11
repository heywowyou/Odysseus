import { Dossier } from '../lib/dossier';
import { Exhibit } from '../lib/exhibit';
import { LanguageSection } from '../lib/language';
import { Reveal } from '../lib/reveal';
import { AccessibilitySchematic, AiSignalsSchematic, RenderSchematic } from '../lib/schematics';
import { Steps, type Step } from '../lib/steps';

/**
 * La page d'accueil. Rédigée en français d'abord ; la colonne anglaise est
 * une traduction du français, jamais l'inverse.
 *
 * Recast 2026-09-11, plan 038: the page now leads with the correction
 * handoff rather than with a tour of the scanner. The dossier card
 * (lib/dossier.tsx, shared with the offer page) shows the shape of the
 * deliverable; it carries generic format text only, never a fabricated
 * finding, score, or metric. Each check sits in a full-width exhibit beside a schematic of
 * what it measures (lib/schematics.tsx: render diff, accessibility gaps, AI
 * signals); the performance copy names LCP, CLS, and availability-qualified
 * INP instead of a three-dot timeline.
 *
 * Chaque affirmation se rattache à docs/rules/offer-positioning.md et aux
 * décisions 14, 18 et 57 de docs/decisions/trade-offs.md : la visibilité IA
 * est décrite comme des signaux techniques vérifiables, jamais comme une
 * prédiction de citation ou de classement ; la performance de laboratoire
 * reste un échantillon représentatif, jamais une mesure universelle. La
 * limite RGAA complète reste énoncée en tête de la page offre ; ici, elle
 * est résumée et renvoie vers cette page.
 *
 * Le rapport est remis dans la langue du client : la page ne présente pas
 * le bilinguisme comme un argument (décision de l'opérateur, 2026-09-11).
 * La seule mention factuelle des deux langues vit sur la page offre.
 *
 * La garde de sens public vit dans lib/marketing-copy.test.ts ; les limites
 * légales et le prix restent gardés par lib/compliance-copy.test.ts et par
 * packages/core/src/offer/pricing.test.ts.
 */

const GUARANTEES_FR = [
  {
    claim: "Chaque constat provient d'un test.",
    basis:
      'Les constats sont établis par des outils de mesure. La rédaction du rapport repose exclusivement sur leurs résultats : elle les explique, les hiérarchise et les formule en langage clair, sans rien y ajouter.',
  },
  {
    claim: 'Chaque constat est localisé.',
    basis:
      "Il indique la page et l'élément concernés. Votre prestataire peut ainsi le vérifier en quelques instants, sans avoir à nous croire sur parole.",
  },
  {
    claim: 'Le rapport ne se prononce pas sur vos obligations légales.',
    basis:
      "Il reproduit les critères réglementaires applicables à votre type d'activité et les données publiques du registre des entreprises, sans conclure à leur application à votre cas. Cette appréciation relève d'un avocat, ce que le rapport rappelle expressément.",
  },
];

const GUARANTEES_EN = [
  {
    claim: 'Every finding comes from a test.',
    basis:
      'Findings are established by measuring tools. The writing of the report relies exclusively on their results: it explains them, ranks them and puts them into plain language, without adding anything.',
  },
  {
    claim: 'Every finding is located.',
    basis:
      'It names the page and the element concerned. Your web provider can check it in moments, without having to take our word for it.',
  },
  {
    claim: 'The report does not rule on your legal obligations.',
    basis:
      'It reproduces the regulatory criteria that apply to your type of activity and the public business registry data, without concluding that they apply to your case. That assessment is for a lawyer, as the report expressly states.',
  },
];

const HANDOFF_FR: readonly Step[] = [
  { title: 'Explorer', text: "L'ensemble du site est parcouru et chaque page est mesurée." },
  { title: 'Localiser', text: "Chaque constat est rattaché à la page et à l'élément concernés." },
  {
    title: 'Hiérarchiser',
    text: 'Les corrections sont classées de la plus urgente à la moins urgente.',
  },
  {
    title: 'Corriger',
    text: 'Vous transmettez la liste à votre prestataire, qui vérifie chaque constat puis le corrige.',
  },
];

const HANDOFF_EN: readonly Step[] = [
  { title: 'Discover', text: 'The whole site is crawled and every page is measured.' },
  { title: 'Locate', text: 'Every finding is tied to the page and the element concerned.' },
  { title: 'Prioritise', text: 'Corrections are ranked from most to least urgent.' },
  {
    title: 'Correct',
    text: 'You hand the list to your web provider, who checks each finding and then fixes it.',
  },
];

export default function Home() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
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
      <section className="shell hero">
        <h1 className="display measure-display">
          Un diagnostic technique pour savoir quoi corriger, où, et dans quel ordre
        </h1>

        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede measure">
              Odysseus analyse l&apos;ensemble de votre site à l&apos;aide d&apos;outils de mesure
              automatisés, puis vous remet un rapport clair&#160;: la liste des corrections à
              apporter, classées par priorité, chacune vérifiable et prête à être transmise à votre
              prestataire.
            </p>

            {/* Résumé de la limite approuvée. La formulation complète reste en
                tête de la page offre, qui reste la première localisation
                faisant autorité (offer-positioning.md, section 2). */}
            <Reveal className="mt-8">
              <div className="statement">
                <p className="label">Portée du diagnostic</p>
                <p className="mt-2">
                  Ceci est un diagnostic technique, pas un audit RGAA. La portée exacte de cette
                  limite est précisée sur la page{' '}
                  <a className="evidence-link" href="/offre">
                    offre
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                Nous écrire
              </a>
              <a className="btn btn-secondary" href="/offre">
                Consulter l&apos;offre
              </a>
            </div>
            {/* Sur mobile, le tarif est autrement à sept écrans de profondeur
                (section « Tarif et contact », plus bas). Une mention brève
                ici évite qu'un visiteur abandonne avant de savoir qu'un prix
                unique existe. Masquée à partir de md, où la mise en page n'a
                pas ce problème de profondeur. */}
            <p className="small muted mt-4 md:hidden">
              Tarif unique et publié&#160;: 1&#160;600&#160;€ HT.
            </p>
          </div>

          <Dossier lang="fr" />
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="recevez">
        <div className="measure">
          <h2 id="recevez" className="heading">
            Ce que vous recevez
          </h2>
          <p className="soft mt-4">Un document de travail, pas une démonstration d&apos;outil.</p>
        </div>

        <Reveal className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">Tout le site, page après page</p>
            <p className="soft mt-2">
              Chaque page explorée avec succès fait l&apos;objet de toutes les vérifications de
              contenu, quel que soit son rôle dans le site.
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
            <p className="receive-title">Un rapport écrit pour un dirigeant</p>
            <p className="soft mt-2">
              L&apos;enjeu, l&apos;effort et la priorité de chaque correction, expliqués sans
              jargon. Le détail technique est réservé à l&apos;annexe, pour votre prestataire.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Des preuves localisées</p>
            <p className="soft mt-2">
              Chaque constat indique la page et l&apos;élément concernés, et repose sur une mesure
              que votre prestataire peut vérifier.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="verifie">
        <div className="measure">
          <h2 id="verifie" className="heading">
            Ce que le diagnostic vérifie
          </h2>
          <p className="soft mt-4">
            Quatre familles de vérifications, limitées à ce que des outils de mesure peuvent
            établir.
          </p>
        </div>

        <div className="exhibits mt-10">
          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Accessibilité</h3>
              <p className="soft mt-3">
                Chaque page est contrôlée élément par élément au regard des règles WCAG 2.2, niveau
                AA, et de la norme européenne EN 301 549. Chaque écart relevé est accompagné de sa
                preuve.
              </p>
            </div>
            <AccessibilitySchematic lang="fr" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Recherche et rendu</h3>
              <p className="soft mt-3">
                Chaque page est chargée deux fois, sans JavaScript puis dans un navigateur complet.
                La comparaison montre ce qu&apos;un moteur de recherche reçoit réellement, et ce qui
                lui échappe de votre contenu.
              </p>
            </div>
            <RenderSchematic lang="fr" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">
                Signaux de visibilité dans les moteurs et assistants IA
              </h3>
              <p className="soft mt-3">
                Le diagnostic contrôle des signaux techniques vérifiables&#160;: les données
                structurées déclarées par votre site, les règles d&apos;accès des robots
                d&apos;indexation IA, le fichier llms.txt et le balisage FAQ.
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
              <h3 className="subheading">Performance et sécurité</h3>
              <p className="soft mt-3">
                La performance de laboratoire est mesurée sur un échantillon représentatif de
                pages&#160;; les données terrain, lorsqu&apos;elles existent, viennent la compléter.
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
                    Réactivité réelle (INP, lorsque des données terrain sont disponibles)
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
            Un rapport automatisé ne vaut que par sa rigueur. Trois principes encadrent le nôtre.
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
            Un tarif unique et publié
          </h2>
          <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
          <p className="soft mt-4">
            Il ne dépend ni de la taille du site ni du nombre de constats, et il vous est confirmé
            par écrit avant tout engagement.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
              Nous écrire
            </a>
            <a className="btn btn-secondary" href="/offre">
              Consulter l&apos;offre
            </a>
          </div>
          <p className="small muted mt-7">
            Le fonctionnement du robot qui réalise ces analyses, et la manière de lui interdire
            l&apos;accès à votre site, sont décrits sur la page{' '}
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
      <section className="shell hero">
        <h1 className="display measure-display">
          A technical diagnostic that tells you what to fix, where, and in what order
        </h1>

        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede measure">
              Odysseus analyses your whole site with automated measuring tools, then gives you a
              clear report: the list of corrections to make, ranked by priority, each one verifiable
              and ready to hand to your web provider.
            </p>

            <Reveal className="mt-8">
              <div className="statement">
                <p className="label">Scope of the diagnostic</p>
                <p className="mt-2">
                  This is a technical diagnostic, not an audit RGAA. The exact scope of this
                  limitation is set out on the{' '}
                  <a className="evidence-link" href="/offre">
                    offer page
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                Write to us
              </a>
              <a className="btn btn-secondary" href="/offre">
                See the offer
              </a>
            </div>
            <p className="small muted mt-4 md:hidden">One published price: EUR 1,600 excl. VAT.</p>
          </div>

          <Dossier lang="en" />
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="receive-en">
        <div className="measure">
          <h2 id="receive-en" className="heading">
            What you receive
          </h2>
          <p className="soft mt-4">A working document, not a product demo.</p>
        </div>

        <Reveal className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">The whole site, page by page</p>
            <p className="soft mt-2">
              Every successfully crawled page receives all the content checks, whatever its role in
              the site.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Corrections ranked by priority</p>
            <p className="soft mt-2">
              Findings are ordered from most to least urgent: you know where to start.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">A report written for a decision maker</p>
            <p className="soft mt-2">
              What is at stake, the effort involved and the priority of each correction, explained
              without jargon. Technical detail is kept to the appendix, for your web provider.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Located evidence</p>
            <p className="soft mt-2">
              Every finding names the page and the element concerned, and rests on a measurement
              your web provider can check.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="shell section section-divided" aria-labelledby="checks-en">
        <div className="measure">
          <h2 id="checks-en" className="heading">
            What the diagnostic checks
          </h2>
          <p className="soft mt-4">
            Four families of checks, limited to what measuring tools can establish.
          </p>
        </div>

        <div className="exhibits mt-10">
          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Accessibility</h3>
              <p className="soft mt-3">
                Every page is checked element by element against WCAG 2.2 level AA and the European
                standard EN 301 549. Every gap found comes with its evidence.
              </p>
            </div>
            <AccessibilitySchematic lang="en" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">Search and rendering</h3>
              <p className="soft mt-3">
                Every page is loaded twice, without JavaScript then in a full browser. The
                comparison shows what a search engine actually receives, and which of your content
                it misses.
              </p>
            </div>
            <RenderSchematic lang="en" />
          </Exhibit>

          <Exhibit>
            <div className="exhibit-copy">
              <h3 className="subheading">AI visibility signals in search engines and assistants</h3>
              <p className="soft mt-3">
                The diagnostic checks technical signals that can be verified: the structured data
                your site declares, the access rules for AI crawlers, the llms.txt file and FAQ
                markup.
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
              <h3 className="subheading">Performance and security</h3>
              <p className="soft mt-3">
                Lab performance is measured on a representative sample of pages; field data, where
                it exists, supplements it.
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
                    How quickly the page responds to interactions, when measurements from real
                    visitors exist.
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
            An automated report is only worth its rigour. Three principles govern ours.
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
            One published price
          </h2>
          <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
          <p className="soft mt-4">
            It does not depend on the size of the site or on the number of findings, and it is
            confirmed to you in writing before any commitment.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
              Write to us
            </a>
            <a className="btn btn-secondary" href="/offre">
              See the offer
            </a>
          </div>
          <p className="small muted mt-7">
            How the bot that runs these analyses works, and how to block it from your site, is
            described on the{' '}
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
