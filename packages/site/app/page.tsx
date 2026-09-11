import { LanguageSection } from '../lib/language';

/**
 * La page d'accueil. Rédigée en français d'abord ; la colonne anglaise est
 * une traduction du français, jamais l'inverse.
 *
 * Recast 2026-09-11, plan 038: the page now leads with the correction
 * handoff rather than with a tour of the scanner. One illustrative dossier
 * card (Constat, Preuve, Action) shows the shape of the deliverable; it
 * carries generic format text only, never a fabricated finding, score, or
 * metric. The former four-diagram block is gone: the raw-versus-rendered
 * comparison survives as a compact inset under the search check, and the
 * performance copy names LCP, CLS, and availability-qualified INP instead
 * of a three-dot timeline.
 *
 * Chaque affirmation se rattache à docs/rules/offer-positioning.md et aux
 * décisions 14, 18 et 57 de docs/decisions/trade-offs.md : la visibilité IA
 * est décrite comme des signaux techniques vérifiables, jamais comme une
 * prédiction de citation ou de classement ; la performance de laboratoire
 * reste un échantillon représentatif, jamais une mesure universelle. La
 * limite RGAA complète reste énoncée en tête de la page offre ; ici, elle
 * est résumée et renvoie vers cette page.
 *
 * La garde de sens public vit dans lib/marketing-copy.test.ts ; les limites
 * légales et le prix restent gardés par lib/compliance-copy.test.ts et par
 * packages/core/src/offer/pricing.test.ts.
 */

/** Une coquille générique de site en JavaScript côté client : la forme du
 *  problème, pas le balisage d'un site en particulier. */
const RAW_DOCUMENT = `<!doctype html>
<html lang="fr">
  <body>
    <div id="root"></div>
    <script src="/app.js"></script>
  </body>
</html>`;

const RAW_DOCUMENT_EN = `<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
    <script src="/app.js"></script>
  </body>
</html>`;

const GUARANTEES_FR = [
  {
    claim: "Chaque constat provient d'un test.",
    basis:
      "Les constats sont établis par des outils de mesure. La rédaction du rapport s'appuie exclusivement sur leurs résultats : elle les explique, les hiérarchise et les traduit, sans rien y ajouter.",
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
      "Findings are established by measuring tools. The report's writing relies exclusively on their results: it explains, prioritises and translates them, without adding anything of its own.",
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
        <p className="label">Diagnostic technique automatisé</p>
        <h1 className="display measure-display mt-5">
          Un diagnostic technique pour savoir quoi corriger, où, et dans quel ordre
        </h1>

        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede">
              Odysseus analyse l&apos;ensemble de votre site avec des outils de mesure automatisés,
              puis remet un rapport en français et en anglais&#160;: une liste de corrections
              hiérarchisée, vérifiable constat par constat, prête à transmettre à votre prestataire.
            </p>

            {/* Résumé de la limite approuvée. La formulation complète reste en
                tête de la page offre, qui reste la première localisation
                faisant autorité (offer-positioning.md, section 2). */}
            <div className="statement mt-8">
              <p className="label">Portée du diagnostic</p>
              <p className="mt-2">
                Ceci est un diagnostic technique, pas un audit RGAA. La portée complète de cette
                limite est énoncée sur la page{' '}
                <a className="evidence-link" href="/offre">
                  offre
                </a>
                .
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                Écrire à Odysseus
              </a>
              <a className="btn btn-secondary" href="/offre">
                Consulter l&apos;offre
              </a>
            </div>
            <p className="small muted mt-3">
              Un message lu personnellement, jamais par un système automatisé&#160;:{' '}
              <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
                contact@odysseusaudit.com
              </a>
              .
            </p>
            {/* Sur mobile, le tarif est autrement à sept écrans de profondeur
                (section « Tarif et contact », plus bas). Une mention brève
                ici évite qu'un visiteur abandonne avant de savoir qu'un prix
                unique existe ; la version complète, avec ses conditions,
                reste uniquement dans cette section plus bas. Masquée à partir
                de md car la mise en page desktop n'a pas ce problème de
                profondeur. */}
            <p className="small muted mt-3 md:hidden">
              Tarif unique et publié&#160;: 1&#160;600&#160;€ HT.
            </p>
          </div>

          {/* La fiche constat signature. Structure de livrable, jamais un
              résultat : aucun chiffre, aucun site réel, aucun constat inventé.
              La règle orange annotant la ligne Action est le seul emploi de
              cette couleur sur la page. */}
          <aside className="split-aside" aria-label="Format d'un constat">
            <div className="dossier">
              <div className="dossier-head">
                <p className="dossier-title">Ce que contient chaque constat</p>
                <p className="dossier-stamp">Rapport Odysseus</p>
              </div>
              <dl>
                <div className="dossier-row">
                  <dt>Constat</dt>
                  <dd>Le problème détecté, énoncé en une phrase claire, sans jargon.</dd>
                </div>
                <div className="dossier-row">
                  <dt>Preuve</dt>
                  <dd>
                    La page et l&apos;élément concernés, avec la mesure qui établit le constat.
                  </dd>
                </div>
                <div className="dossier-row dossier-row-action">
                  <dt>Action</dt>
                  <dd>La correction recommandée, classée dans l&apos;ordre des priorités.</dd>
                </div>
              </dl>
              <p className="dossier-caption">
                Illustration du format du rapport&#160;: elle ne représente ni un site réel, ni un
                constat réel, ni le résultat d&apos;un audit.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="recevez">
        <div className="measure">
          <p className="label">Livrable</p>
          <h2 id="recevez" className="heading mt-3">
            Ce que vous recevez
          </h2>
          <p className="soft mt-4">Un document de travail, pas une démonstration d&apos;outil.</p>
        </div>

        <div className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">Tout le site, page après page</p>
            <p className="soft mt-2">
              Chaque page explorée avec succès reçoit les vérifications de contenu, quel que soit
              son rôle dans le site.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Des corrections hiérarchisées</p>
            <p className="soft mt-2">
              Les constats sont classés par priorité, pour commencer le travail par ce qui compte le
              plus.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Un rapport bilingue</p>
            <p className="soft mt-2">
              Un PDF remis en français et en anglais, rédigé pour un dirigeant, pas pour un
              technicien.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Des preuves localisées</p>
            <p className="soft mt-2">
              Chaque constat nomme la page et l&apos;élément concernés, et s&apos;appuie sur une
              mesure vérifiable.
            </p>
          </div>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="verifie">
        <div className="measure">
          <p className="label">Périmètre</p>
          <h2 id="verifie" className="heading mt-3">
            Ce que le diagnostic vérifie
          </h2>
          <p className="soft mt-4">
            Quatre familles de vérifications, chacune bornée à ce que des outils de mesure
            établissent.
          </p>
        </div>

        <div className="check-grid mt-10">
          <div className="check">
            <h3 className="subheading">Accessibilité</h3>
            <p className="soft mt-3">
              Chaque page est confrontée aux règles WCAG 2.2, niveau AA, et à la norme européenne EN
              301 549, élément par élément, avec la preuve de chaque écart.
            </p>
          </div>

          <div className="check">
            <h3 className="subheading">Recherche et rendu</h3>
            <p className="soft mt-3">
              Chaque page est chargée deux fois, sans JavaScript puis dans un navigateur complet,
              pour révéler ce qu&apos;un moteur de recherche reçoit à la place de votre contenu.
            </p>

            {/* Encart réduit du comparatif brut contre rendu. Il illustre le
                principe de mesure ; l'étiquette ci-dessous interdit de le lire
                comme un résultat. */}
            <div className="diff diff-compact mt-5">
              <div className="diff-panel machine">
                <p className="label">Page reçue par un robot d&apos;indexation</p>
                <pre className="machine-code">
                  <code>{RAW_DOCUMENT}</code>
                </pre>
                <p className="machine-empty">Ni titre, ni texte, ni lien.</p>
              </div>
              <div className="diff-panel visitor">
                <p className="label">Page affichée à un visiteur</p>
                <div className="visitor-doc" aria-hidden="true">
                  {/* L'animation de révélation porte sur les barres, jamais
                      sur le texte : un texte qui apparaît en fondu échoue aux
                      seuils de contraste pendant l'animation. */}
                  <div className="visitor-el">
                    <p className="label">Titre de la page</p>
                    <div
                      className="visitor-bar visitor-bar-strong render-step render-step-1"
                      style={{ width: '78%' }}
                    />
                  </div>
                  <div className="visitor-el">
                    <p className="label">Texte de présentation</p>
                    <div className="visitor-lines render-step render-step-2">
                      <div className="visitor-bar" />
                      <div className="visitor-bar" style={{ width: '94%' }} />
                      <div className="visitor-bar" style={{ width: '61%' }} />
                    </div>
                  </div>
                  <div className="visitor-el">
                    <p className="label">Bouton de contact</p>
                    <div className="visitor-bar-button render-step render-step-3" />
                  </div>
                </div>
                <p className="small muted">
                  Ce contenu n&apos;apparaît qu&apos;après l&apos;exécution du JavaScript&#160;: le
                  robot d&apos;indexation ne l&apos;a jamais reçu.
                </p>
              </div>
            </div>
            <p className="small muted measure mt-3">
              Schéma de principe&#160;: il ne représente ni un site réel, ni le résultat d&apos;un
              audit.
            </p>
          </div>

          <div className="check">
            <h3 className="subheading">Signaux de visibilité dans les moteurs et assistants IA</h3>
            <p className="soft mt-3">
              Le diagnostic vérifie des signaux techniques qui peuvent être établis&#160;: les
              données structurées que votre site déclare, les règles d&apos;accès des robots
              d&apos;indexation IA dans le fichier robots.txt, la présence d&apos;un fichier
              llms.txt et du balisage FAQ. Il ne prédit pas si un assistant IA citera votre site, le
              classera, le recommandera, ou répondra à une question sur votre activité.
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
                  La vitesse à laquelle la page répond aux interactions, quand des mesures réelles
                  de visiteurs existent.
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

      <section className="shell section section-divided" aria-labelledby="remise">
        <div className="measure">
          <p className="label">Déroulé</p>
          <h2 id="remise" className="heading mt-3">
            Comment la remise se déroule
          </h2>
          <p className="soft mt-4">
            De l&apos;observation à la correction, quatre étapes dans l&apos;ordre.
          </p>
        </div>

        <ol className="process mt-10">
          <li>
            <p className="process-step">Explorer</p>
            <p className="soft mt-2">
              L&apos;ensemble du site est parcouru, et chaque page est mesurée.
            </p>
          </li>
          <li>
            <p className="process-step">Localiser</p>
            <p className="soft mt-2">
              Chaque constat est rattaché à la page et à l&apos;élément concernés.
            </p>
          </li>
          <li>
            <p className="process-step">Hiérarchiser</p>
            <p className="soft mt-2">
              Les corrections sont classées, de la plus urgente à la moins urgente.
            </p>
          </li>
          <li>
            <p className="process-step">Corriger</p>
            <p className="soft mt-2">
              Vous transmettez la liste à votre prestataire, qui vérifie puis corrige, constat par
              constat.
            </p>
          </li>
        </ol>
      </section>

      <section className="shell section section-divided" aria-labelledby="methode">
        <div className="measure">
          <p className="label">Méthode et limites</p>
          <h2 id="methode" className="heading mt-3">
            Des constats vérifiables
          </h2>
          <p className="soft mt-4">
            La valeur d&apos;un rapport automatisé tient à sa rigueur. Trois principes encadrent le
            nôtre.
          </p>
        </div>

        <div className="method-grid mt-9">
          {GUARANTEES_FR.map((guarantee) => (
            <div className="method-item" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft small mt-2">{guarantee.basis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="tarif">
        <div className="measure">
          <p className="label">Tarif et contact</p>
          <h2 id="tarif" className="heading mt-3">
            Un tarif unique et publié
          </h2>
          <p className="price numeric mt-5">1&#160;600&#160;€ HT</p>
          <p className="soft mt-4">
            Il ne dépend ni de la taille du site ni du nombre de constats, et il vous est confirmé
            par écrit avant tout engagement.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
              Écrire à Odysseus
            </a>
            <a className="btn btn-secondary" href="/offre">
              Consulter l&apos;offre
            </a>
          </div>
          <p className="small muted mt-3">
            Un message lu personnellement, jamais par un système automatisé&#160;:{' '}
            <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
              contact@odysseusaudit.com
            </a>
            .
          </p>
          <p className="small muted mt-7">
            Le fonctionnement du robot qui réalise ces analyses, ainsi que la manière de lui
            interdire l&apos;accès à votre site, sont décrits sur la page{' '}
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
        <p className="label">An automated technical diagnostic</p>
        <h1 className="display measure-display mt-5">
          A technical diagnostic that tells you what to fix, where, and in what order
        </h1>

        <div className="split mt-10 hero-split">
          <div className="split-main">
            <p className="lede">
              Odysseus analyses your whole site with automated measuring tools, then delivers a
              report in French and English: a prioritised list of corrections, verifiable finding by
              finding, ready to hand to your web provider.
            </p>

            <div className="statement mt-8">
              <p className="label">Scope of the diagnostic</p>
              <p className="mt-2">
                This is a technical diagnostic, not an audit RGAA. The full wording of this
                limitation is set out on the{' '}
                <a className="evidence-link" href="/offre">
                  offer page
                </a>
                .
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
                Write to Odysseus
              </a>
              <a className="btn btn-secondary" href="/offre">
                See the offer
              </a>
            </div>
            <p className="small muted mt-3">
              Read personally, never by an automated system:{' '}
              <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
                contact@odysseusaudit.com
              </a>
              .
            </p>
            <p className="small muted mt-3 md:hidden">One published price: EUR 1,600 excl. VAT.</p>
          </div>

          <aside className="split-aside" aria-label="Shape of a finding">
            <div className="dossier">
              <div className="dossier-head">
                <p className="dossier-title">What every finding contains</p>
                <p className="dossier-stamp">Odysseus report</p>
              </div>
              <dl>
                <div className="dossier-row">
                  <dt>Finding</dt>
                  <dd>The detected problem, stated in one clear sentence, without jargon.</dd>
                </div>
                <div className="dossier-row">
                  <dt>Evidence</dt>
                  <dd>
                    The page and the element concerned, with the measurement that establishes the
                    finding.
                  </dd>
                </div>
                <div className="dossier-row dossier-row-action">
                  <dt>Action</dt>
                  <dd>The recommended correction, ranked by priority.</dd>
                </div>
              </dl>
              <p className="dossier-caption">
                An illustration of the report format: it represents neither a real site, nor a real
                finding, nor an audit result.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="receive-en">
        <div className="measure">
          <p className="label">Deliverable</p>
          <h2 id="receive-en" className="heading mt-3">
            What you receive
          </h2>
          <p className="soft mt-4">A working document, not a product demo.</p>
        </div>

        <div className="receive-grid mt-9">
          <div className="receive-item">
            <p className="receive-title">The whole site, page by page</p>
            <p className="soft mt-2">
              Every successfully crawled page receives the content checks, whatever its role in the
              site.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Prioritised corrections</p>
            <p className="soft mt-2">
              Findings are ranked by priority, so the work starts with what matters most.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">A bilingual report</p>
            <p className="soft mt-2">
              A PDF delivered in French and English, written for a decision maker, not for a
              technician.
            </p>
          </div>
          <div className="receive-item">
            <p className="receive-title">Located evidence</p>
            <p className="soft mt-2">
              Every finding names the page and the element concerned, and rests on a checkable
              measurement.
            </p>
          </div>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="checks-en">
        <div className="measure">
          <p className="label">Scope</p>
          <h2 id="checks-en" className="heading mt-3">
            What the diagnostic checks
          </h2>
          <p className="soft mt-4">
            Four families of checks, each bounded to what measuring tools can establish.
          </p>
        </div>

        <div className="check-grid mt-10">
          <div className="check">
            <h3 className="subheading">Accessibility</h3>
            <p className="soft mt-3">
              Every page is checked element by element against WCAG 2.2 level AA and the European
              standard EN 301 549, with the evidence for every gap.
            </p>
          </div>

          <div className="check">
            <h3 className="subheading">Search and rendering</h3>
            <p className="soft mt-3">
              Every page is loaded twice, without JavaScript then in a full browser, to reveal what
              a search engine receives in place of your content.
            </p>

            <div className="diff diff-compact mt-5">
              <div className="diff-panel machine">
                <p className="label">Page received by a crawler</p>
                <pre className="machine-code">
                  <code>{RAW_DOCUMENT_EN}</code>
                </pre>
                <p className="machine-empty">No title, no text, no link.</p>
              </div>
              <div className="diff-panel visitor">
                <p className="label">Page shown to a visitor</p>
                <div className="visitor-doc" aria-hidden="true">
                  {/* The reveal animation applies to the bars only, never to
                      text: fading text fails contrast thresholds while the
                      animation runs. */}
                  <div className="visitor-el">
                    <p className="label">Page title</p>
                    <div
                      className="visitor-bar visitor-bar-strong render-step render-step-1"
                      style={{ width: '78%' }}
                    />
                  </div>
                  <div className="visitor-el">
                    <p className="label">Introductory text</p>
                    <div className="visitor-lines render-step render-step-2">
                      <div className="visitor-bar" />
                      <div className="visitor-bar" style={{ width: '94%' }} />
                      <div className="visitor-bar" style={{ width: '61%' }} />
                    </div>
                  </div>
                  <div className="visitor-el">
                    <p className="label">Contact button</p>
                    <div className="visitor-bar-button render-step render-step-3" />
                  </div>
                </div>
                <p className="small muted">
                  This content only appears once JavaScript has run: the crawler never received it.
                </p>
              </div>
            </div>
            <p className="small muted measure mt-3">
              A schematic illustration: it represents neither a real site nor an audit result.
            </p>
          </div>

          <div className="check">
            <h3 className="subheading">AI visibility signals in search engines and assistants</h3>
            <p className="soft mt-3">
              The diagnostic checks technical signals that can be verified: the structured data your
              site declares, the AI-crawler access rules declared in robots.txt, the presence of an
              llms.txt file and of FAQ markup. It does not predict whether an AI assistant will cite
              your site, rank it, recommend it, or answer a question about your business.
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
              The server&apos;s security headers are checked across the whole site, independently of
              loading speed.
            </p>
          </div>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="handoff-en">
        <div className="measure">
          <p className="label">Sequence</p>
          <h2 id="handoff-en" className="heading mt-3">
            How the handoff works
          </h2>
          <p className="soft mt-4">From observation to correction, four steps in order.</p>
        </div>

        <ol className="process mt-10">
          <li>
            <p className="process-step">Discover</p>
            <p className="soft mt-2">The whole site is crawled, and every page is measured.</p>
          </li>
          <li>
            <p className="process-step">Locate</p>
            <p className="soft mt-2">
              Every finding is tied to the page and the element concerned.
            </p>
          </li>
          <li>
            <p className="process-step">Prioritise</p>
            <p className="soft mt-2">Corrections are ranked, most urgent first.</p>
          </li>
          <li>
            <p className="process-step">Correct</p>
            <p className="soft mt-2">
              You hand the list to your web provider, who verifies then fixes it, finding by
              finding.
            </p>
          </li>
        </ol>
      </section>

      <section className="shell section section-divided" aria-labelledby="method-en">
        <div className="measure">
          <p className="label">Method and limits</p>
          <h2 id="method-en" className="heading mt-3">
            Verifiable findings
          </h2>
          <p className="soft mt-4">
            An automated report is only as good as its discipline. Three principles govern ours.
          </p>
        </div>

        <div className="method-grid mt-9">
          {GUARANTEES_EN.map((guarantee) => (
            <div className="method-item" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft small mt-2">{guarantee.basis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="price-en">
        <div className="measure">
          <p className="label">Price and contact</p>
          <h2 id="price-en" className="heading mt-3">
            One published price
          </h2>
          <p className="price numeric mt-5">EUR 1,600 excl. VAT</p>
          <p className="soft mt-4">
            It does not depend on the size of the site or on the number of findings, and it is
            confirmed to you in writing before any commitment.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="mailto:contact@odysseusaudit.com">
              Write to Odysseus
            </a>
            <a className="btn btn-secondary" href="/offre">
              See the offer
            </a>
          </div>
          <p className="small muted mt-3">
            Read personally, never by an automated system:{' '}
            <a className="evidence-link" href="mailto:contact@odysseusaudit.com">
              contact@odysseusaudit.com
            </a>
            .
          </p>
          <p className="small muted mt-7">
            How the bot that runs these analyses works, and how to block it from your site, are
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
