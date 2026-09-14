import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  "Ce que fait OdysseusBot lorsqu'il visite un site : pages consultées, rythme des requêtes, données conservées et moyens de le bloquer.";

// Issue #213 item 5: a bare "OdysseusBot" title rendered as just
// "OdysseusBot | Odysseus" (22 characters) via the layout's title
// template - too short to be a useful SERP result. `absolute` sets the
// full tag directly instead of feeding the template, since the template
// suffix would otherwise repeat "Odysseus" a second time here.
const title = "OdysseusBot, le robot d'audit technique Odysseus";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: '/bot' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/bot',
    title,
    description,
  },
};

export default function BotInfoPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading className="title measure" fr="OdysseusBot" en="OdysseusBot" />
      </section>
      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            Ce que fait ce robot lorsqu&apos;il visite un site, les données qu&apos;il conserve et
            comment bloquer son accès.
          </p>
        </section>

        <div className="shell section-tight">
          <dl className="receive-grid mt-2 mb-10">
            <div className="receive-item">
              <dt className="receive-title">Identification</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#identification-bot">
                  En-tête User-Agent, règle de blocage
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Rythme des requêtes</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#frequence-bot">
                  Au moins une seconde entre deux requêtes
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Prospection</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#prospection-bot">
                  Jusqu&apos;à trois pages lors de la première analyse
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Conservation</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#conservation-bot">
                  90 jours, puis suppression automatique
                </a>
              </dd>
            </div>
          </dl>

          <section className="prose measure">
            <p>
              Odysseus est un outil de diagnostic technique de sites web. S&apos;il visite votre
              site, c&apos;est dans l&apos;un des deux cas suivants&#160;: un diagnostic a été
              commandé pour ce site, ou le site a été analysé dans le cadre d&apos;une démarche de
              prospection commerciale afin d&apos;identifier des problèmes techniques avant une
              prise de contact.
            </p>

            <p>
              Le comportement d&apos;OdysseusBot diffère selon le type d&apos;analyse&#160;; les
              deux cas peuvent donc être distingués dans les journaux d&apos;accès de votre serveur.
            </p>

            <p>
              <strong>Diagnostic commandé</strong>&#160;: le robot parcourt le site, charge chaque
              page avec et sans exécution JavaScript afin d&apos;identifier les contenus ou liens
              absents du HTML initial, notamment sur certains sites rendus côté client avec React ou
              Next.js. Il exécute également des contrôles automatisés d&apos;accessibilité
              (axe-core) et des mesures de performance (Lighthouse) sur une sélection déterministe
              de pages.
            </p>

            <p id="prospection-bot">
              <strong>Analyse de prospection</strong>&#160;: lors de la première analyse, le robot
              consulte au maximum trois pages et n&apos;exécute pas Lighthouse. Il charge chaque
              page avec et sans JavaScript et effectue les contrôles automatisés
              d&apos;accessibilité. Pour un nombre restreint d&apos;établissements présélectionnés,
              une analyse complète du site est ensuite réalisée selon la même méthode et le même
              rythme de requêtes qu&apos;un diagnostic commandé. Dans les deux cas, le robot ne crée
              aucun compte, ne soumet aucun formulaire et n&apos;effectue aucune réservation.
            </p>

            <p id="identification-bot">
              Identification&#160;: l&apos;en-tête User-Agent de ses requêtes contient la mention
              OdysseusBot/1.0. Pour le bloquer, ajoutez ceci à votre fichier robots.txt&#160;:
            </p>

            <pre className="codeblock">
              <code>{'User-agent: OdysseusBot\nDisallow: /'}</code>
            </pre>

            <p id="frequence-bot">
              Rythme des requêtes&#160;: OdysseusBot attend au moins une seconde entre deux
              requêtes. Si votre fichier robots.txt définit une directive Crawl-delay plus longue,
              c&apos;est elle qui s&apos;applique. Le fichier robots.txt est lu avant toute visite
              et les pages interdites ne sont jamais chargées.
            </p>

            <p id="conservation-bot">
              Nous conservons le rendu des pages et les captures d&apos;écran à des fins de
              diagnostic uniquement. Ils sont supprimés automatiquement après 90 jours et ne sont ni
              vendus ni transmis à des tiers pour leur propre usage. Pour une analyse de
              prospection, l&apos;origine des données, leur usage et la marche à suivre pour
              s&apos;y opposer sont détaillés sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospection et données personnelles
              </a>
              .
            </p>

            <p>
              Contact&#160;: contact@odysseusaudit.fr, pour toute question ou pour demander le
              retrait de votre site de toute analyse en cours ou future. La page{' '}
              <a className="underline" href="/desinscription">
                ne plus être contacté
              </a>{' '}
              explique ce qui se passe ensuite.
            </p>

            <p>
              Mentions légales&#160;: entreprise individuelle en cours d&apos;immatriculation
              (micro-entrepreneur, France). Numéro SIREN en attente d&apos;attribution.
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            What this crawler does when it visits a website, what data it retains, and how to block
            it.
          </p>
        </section>

        <div className="shell section-tight">
          <dl className="receive-grid mt-2 mb-10">
            <div className="receive-item">
              <dt className="receive-title">Identification</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#identification-bot-en">
                  User-Agent header, blocking rule
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Request pacing</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#pacing-bot-en">
                  At least one second between requests
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Outreach</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#prospecting-bot-en">
                  Up to three pages in the initial analysis
                </a>
              </dd>
            </div>
            <div className="receive-item">
              <dt className="receive-title">Retention</dt>
              <dd className="soft mt-2">
                <a className="evidence-link" href="#retention-bot-en">
                  90 days, then automatic deletion
                </a>
              </dd>
            </div>
          </dl>

          <section className="prose measure">
            <p>
              Odysseus is a technical website diagnostic tool. If it visits your site, one of two
              things is happening: a diagnostic has been commissioned for the site, or the site is
              being analysed as part of commercial outreach to identify technical issues before we
              make contact.
            </p>

            <p>
              OdysseusBot behaves differently in each case, so the two types of analysis can be
              distinguished in your server access logs.
            </p>

            <p>
              <strong>Commissioned diagnostic</strong>: the crawler moves through the site and loads
              each page with and without JavaScript to identify content or links that are absent
              from the initial HTML, including on some client-rendered React or Next.js sites. It
              also runs automated accessibility checks with axe-core and Lighthouse performance
              measurements on a deterministic selection of pages.
            </p>

            <p id="prospecting-bot-en">
              <strong>Outreach analysis</strong>: during the initial analysis, the crawler accesses
              no more than three pages and does not run Lighthouse. It loads each page with and
              without JavaScript and runs the automated accessibility checks. For a small number of
              pre-selected establishments, a full-site analysis then follows using the same method
              and request pacing as a commissioned diagnostic. In both cases, the crawler creates no
              account, submits no form and makes no booking.
            </p>

            <p id="identification-bot-en">
              Identification: the User-Agent header on its requests contains OdysseusBot/1.0. To
              block it, add the following rule to your robots.txt file:
            </p>

            <pre className="codeblock">
              <code>{'User-agent: OdysseusBot\nDisallow: /'}</code>
            </pre>

            <p id="pacing-bot-en">
              Request pacing: OdysseusBot waits at least one second between requests. If your
              robots.txt file specifies a longer Crawl-delay, that value takes precedence.
              robots.txt is read before any page is visited, and disallowed pages are never loaded.
            </p>

            <p id="retention-bot-en">
              We retain rendered pages and screenshots for diagnostic purposes only. They are
              automatically deleted after 90 days and are neither sold nor disclosed to third
              parties for their own use. For outreach analysis, the source of the data, how it is
              used and how to object are explained on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                outreach and personal data
              </a>{' '}
              page.
            </p>

            <p>
              Contact: contact@odysseusaudit.fr for any question, or to ask us to remove your site
              from current or future analysis. The{' '}
              <a className="underline" href="/desinscription">
                opt-out page
              </a>{' '}
              explains what happens next.
            </p>

            <p>
              Legal: sole proprietorship in the process of registration (micro-entrepreneur,
              France). SIREN number pending assignment.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
