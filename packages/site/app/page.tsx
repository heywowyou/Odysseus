import { LanguageSection } from '../lib/language';

/**
 * La page d'accueil. Rédigée en français d'abord ; la colonne anglaise est
 * une traduction du français, jamais l'inverse.
 *
 * Chaque affirmation se rattache à docs/rules/offer-positioning.md et au
 * brief du site. La limite est énoncée avant toute promesse, conformément à
 * la règle de positionnement : la phrase approuvée de la section 2 ouvre la
 * page. Aucun témoignage, aucune statistique, aucune urgence, aucune image :
 * rien de tout cela n'existe.
 *
 * Quatre schémas illustrent les quatre familles de constats plutôt qu'une
 * seule : le rendu (crawler contre visiteur), l'accessibilité (lecteur
 * d'écran contre visiteur voyant), la visibilité IA (assistant contre
 * visiteur) et la performance (une frise de trois instants mesurés, sans
 * valeur chiffrée puisqu'aucune mesure réelle n'existe ici). Aucun ne
 * représente un résultat mesuré ni un site en particulier ; chacun illustre
 * un défaut réel que les outils de mesure détectent.
 *
 * Bascule de langue du 2026-09-10&#160;: la page, jusque là uniquement en
 * français ("mode persuasion, français d'abord"), est désormais bilingue
 * comme le reste du site, pilotée par le même sélecteur du bandeau. Voir
 * `app/offre/page.tsx` pour le mécanisme, documenté une fois.
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

const NO_STRUCTURED_DATA_FR = `<!-- Aucune donnée structurée
     détectée sur cette page -->`;

const NO_STRUCTURED_DATA_EN = `<!-- No structured data
     detected on this page -->`;

const PLACEHOLDER_INPUT = `<input type="email"
  placeholder="Adresse e-mail">`;

const PLACEHOLDER_INPUT_EN = `<input type="email"
  placeholder="Email address">`;

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
        <p className="label">Accessibilité, référencement naturel, performance</p>
        <h1 className="display measure-display mt-5">
          Un diagnostic technique de votre site, vérifiable constat par constat
        </h1>

        <div className="split mt-10">
          {/* Placée en premier dans le document pour que la limite soit lue
              avant toute promesse, conformément à la règle de positionnement ;
              disposée dans la seconde colonne sur grand écran, à côté du
              chapeau plutôt qu'après lui. */}
          <div className="statement split-aside">
            <p className="label">Portée du diagnostic</p>
            <p className="mt-2">
              Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de
              conformité officiel et ne peut pas servir de base à une déclaration
              d&apos;accessibilité.
            </p>
          </div>

          <div className="split-main">
            <p className="lede">
              Odysseus analyse l&apos;ensemble de votre site au moyen de tests automatisés et
              reproductibles, puis vous remet un rapport en français et en anglais. Pour chaque
              constat, la page et l&apos;élément concernés sont précisés&#160;: votre prestataire
              web peut le vérifier, puis le corriger.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="/offre">
                Consulter l&apos;offre
              </a>
              <a className="btn btn-secondary" href="mailto:contact@odysseusaudit.com">
                Nous écrire
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="couverture">
        <div className="measure">
          <p className="label">Périmètre</p>
          <h2 id="couverture" className="heading mt-3">
            Ce que couvre le diagnostic
          </h2>
          <p className="soft mt-4">
            Quatre familles de constats, chacune illustrée par un exemple réel de ce que les outils
            de mesure détectent.
          </p>
        </div>

        {/* Bloc 1 : référencement naturel. Le schéma signature de la page,
            seul à porter l'animation de révélation. */}
        <div className="mt-12">
          <h3 className="subheading">Référencement naturel</h3>
          <p className="soft mt-3 measure">
            Sur de nombreux sites récents, le contenu des pages est généré par JavaScript, dans le
            navigateur du visiteur. Celui-ci n&apos;y voit aucune différence&#160;; un robot
            d&apos;indexation, en revanche, peut ne recevoir qu&apos;une page vide. Le diagnostic
            charge donc chaque page deux fois, sans JavaScript puis dans un navigateur complet, et
            compare les deux versions.
          </p>

          <div className="diff mt-6">
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
                <div className="visitor-el render-step render-step-1">
                  <p className="label">Titre de la page</p>
                  <div className="visitor-bar visitor-bar-strong" style={{ width: '78%' }} />
                </div>
                <div className="visitor-el render-step render-step-2">
                  <p className="label">Texte de présentation</p>
                  <div className="visitor-lines">
                    <div className="visitor-bar" />
                    <div className="visitor-bar" style={{ width: '94%' }} />
                    <div className="visitor-bar" style={{ width: '61%' }} />
                  </div>
                </div>
                <div className="visitor-el render-step render-step-3">
                  <p className="label">Liens de navigation</p>
                  <div className="visitor-lines">
                    <div className="visitor-bar" style={{ width: '72%' }} />
                    <div className="visitor-bar" style={{ width: '55%' }} />
                  </div>
                </div>
                <div className="visitor-el render-step render-step-4">
                  <p className="label">Bouton de contact</p>
                  <div className="visitor-bar-button" />
                </div>
              </div>
              <p className="small muted">
                Ce contenu n&apos;apparaît qu&apos;après l&apos;exécution du JavaScript&#160;; le
                robot d&apos;indexation ne l&apos;a jamais reçu.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Schéma de principe&#160;: il ne représente ni un site réel ni le résultat d&apos;un
            audit.
          </p>
        </div>

        {/* Bloc 2 : accessibilité. */}
        <div className="mt-12">
          <h3 className="subheading">Accessibilité</h3>
          <p className="soft mt-3 measure">
            Un espace réservé (placeholder) qui ressemble à une étiquette n&apos;en est pas une
            &#160;: dès la première frappe, il disparaît, et rien ne demeure pour identifier le
            champ. Les contrôles automatisés le signalent&#160;; un visiteur voyant ne le remarque
            jamais.
          </p>

          <div className="diff diff-compact mt-6">
            <div className="diff-panel machine">
              <p className="label">Ce qu&apos;annonce un lecteur d&apos;écran</p>
              <pre className="machine-code">
                <code>{PLACEHOLDER_INPUT}</code>
              </pre>
              <p className="machine-empty">« Champ de saisie. » Aucune étiquette annoncée.</p>
            </div>

            <div className="diff-panel visitor">
              <p className="label">Ce que voit un visiteur</p>
              <div className="visitor-el" aria-hidden="true">
                <p className="label">Champ de formulaire</p>
                <div className="visitor-input">
                  <span className="visitor-input-placeholder">Adresse e-mail</span>
                </div>
              </div>
              <p className="small muted">
                Le texte disparaît dès la première frappe&#160;: rien ne demeure pour un visiteur
                qui utilise un lecteur d&apos;écran.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Illustration d&apos;un défaut réel détecté par le diagnostic. Elle ne représente aucun
            site en particulier.
          </p>
        </div>

        {/* Bloc 3 : visibilité IA / GEO. */}
        <div className="mt-12">
          <h3 className="subheading">Visibilité auprès des assistants IA</h3>
          <p className="soft mt-3 measure">
            Un assistant d&apos;intelligence artificielle ne visite pas une page comme un
            visiteur&#160;: il lit le code et les données structurées pour comprendre qui vous êtes,
            où vous êtes, et ce que vous proposez. En leur absence, il ne peut que deviner, ou
            passer votre page.
          </p>

          <div className="diff diff-compact mt-6">
            <div className="diff-panel machine">
              <p className="label">Données structurées de la page</p>
              <pre className="machine-code">
                <code>{NO_STRUCTURED_DATA_FR}</code>
              </pre>
              <p className="machine-empty">Nom, adresse et horaires non identifiés.</p>
            </div>

            <div className="diff-panel visitor">
              <p className="label">Ce que comprend un visiteur</p>
              <div className="visitor-doc" aria-hidden="true">
                <div className="visitor-el">
                  <p className="label">Nom de l&apos;établissement</p>
                  <div className="visitor-bar visitor-bar-strong" style={{ width: '68%' }} />
                </div>
                <div className="visitor-el">
                  <p className="label">Adresse</p>
                  <div className="visitor-bar" style={{ width: '84%' }} />
                </div>
                <div className="visitor-el">
                  <p className="label">Horaires d&apos;ouverture</p>
                  <div className="visitor-bar" style={{ width: '58%' }} />
                </div>
              </div>
              <p className="small muted">
                Ces informations existent sur la page. Sans données structurées, un assistant IA ne
                les reçoit pas de la même façon.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Illustration du principe mesuré par le diagnostic. Elle ne représente aucun site en
            particulier.
          </p>
        </div>

        {/* Bloc 4 : performance et sécurité, frise plutôt que diff : aucune
            valeur chiffrée n'est inventée ici. */}
        <div className="mt-12">
          <h3 className="subheading">Performance et sécurité</h3>
          <p className="soft mt-3 measure">
            Un site peut sembler chargé alors qu&apos;il ne répond pas encore aux clics ni au
            défilement. Le diagnostic mesure trois instants distincts de ce chargement, sur un
            échantillon représentatif de pages, et les compare aux seuils publics utilisés par les
            moteurs de recherche. Les en-têtes de sécurité du serveur sont contrôlés en parallèle.
          </p>

          <div className="card mt-6">
            <div className="timeline">
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    Premier affichage
                  </p>
                  <p className="small muted mt-1">Le navigateur commence à peindre la page.</p>
                </div>
              </div>
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    Contenu principal visible
                  </p>
                  <p className="small muted mt-1">
                    L&apos;élément le plus visible de la page apparaît.
                  </p>
                </div>
              </div>
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    Page réellement utilisable
                  </p>
                  <p className="small muted mt-1">La page répond aux clics et au défilement.</p>
                </div>
              </div>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Trois instants mesurés par le diagnostic, illustrés ici sans valeur chiffrée&#160;:
            chaque rapport indique les temps réellement observés sur votre site.
          </p>
        </div>

        <p className="soft measure mt-12">
          Le rapport est remis en français et en anglais, et rédigé pour des dirigeants sans
          compétence technique particulière. Il est entièrement automatisé et ne comprend aucune
          vérification manuelle.
        </p>
      </section>

      <section className="shell section section-divided" aria-labelledby="garanties">
        <div className="measure">
          <p className="label">Méthode</p>
          <h2 id="garanties" className="heading mt-3">
            Des constats vérifiables
          </h2>
          <p className="soft mt-4">
            La valeur d&apos;un rapport automatisé tient à sa rigueur. Trois principes encadrent le
            nôtre.
          </p>
        </div>

        <div className="mt-9">
          {GUARANTEES_FR.map((guarantee) => (
            <div className="basis-row" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft">{guarantee.basis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="tarif">
        <div className="split">
          <div className="split-main">
            <p className="label">Tarif</p>
            <h2 id="tarif" className="heading mt-3">
              Un tarif unique et publié
            </h2>
            <p className="soft mt-4 max-w-md">
              Il ne dépend ni de la taille du site ni du nombre de constats, et vous est confirmé
              par écrit avant tout engagement.
            </p>
            <p className="small muted mt-6 max-w-md">
              Le fonctionnement du robot qui réalise ces analyses, ainsi que la manière de lui
              interdire l&apos;accès à votre site, sont décrits sur la page{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>
              .
            </p>
          </div>

          <div className="card card-accent split-aside">
            <p className="label">Audit complet</p>
            <p className="price mt-3">1&#160;600&#160;€ HT</p>
            <a className="btn btn-primary mt-6 w-full" href="mailto:contact@odysseusaudit.com">
              Commander par e-mail
            </a>
            <p className="small mt-4">
              <a className="underline" href="/offre">
                Consulter le détail de l&apos;offre
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function HomeEn() {
  return (
    <>
      <section className="shell hero">
        <p className="label">Accessibility, search optimisation, performance</p>
        <h1 className="display measure-display mt-5">
          A technical diagnostic of your website, verifiable finding by finding
        </h1>

        <div className="split mt-10">
          <div className="statement split-aside">
            <p className="label">Scope of the diagnostic</p>
            <p className="mt-2">
              This is a technical diagnostic, not an audit RGAA. It does not produce an official
              conformity rate and cannot serve as the basis for an accessibility statement.
            </p>
          </div>

          <div className="split-main">
            <p className="lede">
              Odysseus analyses your whole site using automated, reproducible tests, then hands you
              a report in French and English. Every finding names the page and the element
              concerned: your web provider can check it, then fix it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a className="btn btn-primary" href="/offre">
                See the offer
              </a>
              <a className="btn btn-secondary" href="mailto:contact@odysseusaudit.com">
                Write to us
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="scope-en">
        <div className="measure">
          <p className="label">Scope</p>
          <h2 id="scope-en" className="heading mt-3">
            What the diagnostic covers
          </h2>
          <p className="soft mt-4">
            Four families of findings, each illustrated with a real example of what the measuring
            tools detect.
          </p>
        </div>

        <div className="mt-12">
          <h3 className="subheading">Search optimisation</h3>
          <p className="soft mt-3 measure">
            On many recent sites, page content is generated by JavaScript, in the visitor&apos;s
            browser. A visitor sees no difference; a crawler, on the other hand, may receive only an
            empty page. The diagnostic loads every page twice, without JavaScript and then in a full
            browser, and compares the two.
          </p>

          <div className="diff mt-6">
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
                <div className="visitor-el render-step render-step-1">
                  <p className="label">Page title</p>
                  <div className="visitor-bar visitor-bar-strong" style={{ width: '78%' }} />
                </div>
                <div className="visitor-el render-step render-step-2">
                  <p className="label">Introductory text</p>
                  <div className="visitor-lines">
                    <div className="visitor-bar" />
                    <div className="visitor-bar" style={{ width: '94%' }} />
                    <div className="visitor-bar" style={{ width: '61%' }} />
                  </div>
                </div>
                <div className="visitor-el render-step render-step-3">
                  <p className="label">Navigation links</p>
                  <div className="visitor-lines">
                    <div className="visitor-bar" style={{ width: '72%' }} />
                    <div className="visitor-bar" style={{ width: '55%' }} />
                  </div>
                </div>
                <div className="visitor-el render-step render-step-4">
                  <p className="label">Contact button</p>
                  <div className="visitor-bar-button" />
                </div>
              </div>
              <p className="small muted">
                This content only appears once JavaScript has run; the crawler never received it.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            A schematic illustration: it represents neither a real site nor an audit result.
          </p>
        </div>

        <div className="mt-12">
          <h3 className="subheading">Accessibility</h3>
          <p className="soft mt-3 measure">
            A placeholder that looks like a label is not one: as soon as you start typing, it
            disappears, and nothing remains to identify the field. Automated checks flag it; a
            sighted visitor never notices.
          </p>

          <div className="diff diff-compact mt-6">
            <div className="diff-panel machine">
              <p className="label">What a screen reader announces</p>
              <pre className="machine-code">
                <code>{PLACEHOLDER_INPUT_EN}</code>
              </pre>
              <p className="machine-empty">&#8220;Edit text.&#8221; No label announced.</p>
            </div>

            <div className="diff-panel visitor">
              <p className="label">What a visitor sees</p>
              <div className="visitor-el" aria-hidden="true">
                <p className="label">Form field</p>
                <div className="visitor-input">
                  <span className="visitor-input-placeholder">Email address</span>
                </div>
              </div>
              <p className="small muted">
                The text disappears at the first keystroke: nothing remains for a visitor using a
                screen reader.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Illustration of a real defect the diagnostic detects. It represents no particular site.
          </p>
        </div>

        <div className="mt-12">
          <h3 className="subheading">Visibility to AI assistants</h3>
          <p className="soft mt-3 measure">
            An artificial intelligence assistant does not visit a page like a visitor: it reads the
            code and the structured data to understand who you are, where you are, and what you
            offer. Without it, it can only guess, or skip your page.
          </p>

          <div className="diff diff-compact mt-6">
            <div className="diff-panel machine">
              <p className="label">Structured data on the page</p>
              <pre className="machine-code">
                <code>{NO_STRUCTURED_DATA_EN}</code>
              </pre>
              <p className="machine-empty">Name, address and hours not identified.</p>
            </div>

            <div className="diff-panel visitor">
              <p className="label">What a visitor understands</p>
              <div className="visitor-doc" aria-hidden="true">
                <div className="visitor-el">
                  <p className="label">Establishment name</p>
                  <div className="visitor-bar visitor-bar-strong" style={{ width: '68%' }} />
                </div>
                <div className="visitor-el">
                  <p className="label">Address</p>
                  <div className="visitor-bar" style={{ width: '84%' }} />
                </div>
                <div className="visitor-el">
                  <p className="label">Opening hours</p>
                  <div className="visitor-bar" style={{ width: '58%' }} />
                </div>
              </div>
              <p className="small muted">
                This information exists on the page. Without structured data, an AI assistant does
                not receive it the same way.
              </p>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Illustration of the principle the diagnostic measures. It represents no particular site.
          </p>
        </div>

        <div className="mt-12">
          <h3 className="subheading">Performance and security</h3>
          <p className="soft mt-3 measure">
            A site can look loaded while it still does not respond to clicks or scrolling. The
            diagnostic measures three distinct instants of that loading, on a representative sample
            of pages, and compares them against the public thresholds search engines use. The
            server&apos;s security headers are checked at the same time.
          </p>

          <div className="card mt-6">
            <div className="timeline">
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    First paint
                  </p>
                  <p className="small muted mt-1">The browser starts painting the page.</p>
                </div>
              </div>
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    Largest content visible
                  </p>
                  <p className="small muted mt-1">The page&apos;s largest element appears.</p>
                </div>
              </div>
              <div className="timeline-point">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="subheading" style={{ fontSize: '0.9375rem' }}>
                    Page actually usable
                  </p>
                  <p className="small muted mt-1">The page responds to clicks and scrolling.</p>
                </div>
              </div>
            </div>
          </div>

          <p className="small muted measure mt-3">
            Three instants the diagnostic measures, shown here with no numeric value: every report
            states the times actually observed on your site.
          </p>
        </div>

        <p className="soft measure mt-12">
          The report is delivered in French and English, and written for executives without any
          particular technical background. It is fully automated and includes no manual check.
        </p>
      </section>

      <section className="shell section section-divided" aria-labelledby="method-en">
        <div className="measure">
          <p className="label">Method</p>
          <h2 id="method-en" className="heading mt-3">
            Verifiable findings
          </h2>
          <p className="soft mt-4">
            An automated report is only as good as its discipline. Three principles govern ours.
          </p>
        </div>

        <div className="mt-9">
          {GUARANTEES_EN.map((guarantee) => (
            <div className="basis-row" key={guarantee.claim}>
              <p className="subheading">{guarantee.claim}</p>
              <p className="soft">{guarantee.basis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell section section-divided" aria-labelledby="price-en">
        <div className="split">
          <div className="split-main">
            <p className="label">Price</p>
            <h2 id="price-en" className="heading mt-3">
              One published price
            </h2>
            <p className="soft mt-4 max-w-md">
              It does not depend on the size of the site or on the number of findings, and it is
              confirmed to you in writing before any commitment.
            </p>
            <p className="small muted mt-6 max-w-md">
              How the bot that runs these analyses works, and how to block it from your site, are
              described on the{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>{' '}
              page.
            </p>
          </div>

          <div className="card card-accent split-aside">
            <p className="label">Full audit</p>
            <p className="price mt-3">EUR 1,600 excl. VAT</p>
            <a className="btn btn-primary mt-6 w-full" href="mailto:contact@odysseusaudit.com">
              Order by email
            </a>
            <p className="small mt-4">
              <a className="underline" href="/offre">
                See the offer in detail
              </a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
