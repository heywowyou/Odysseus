import type { Metadata } from 'next';
import { LanguageSection } from '../../lib/language';

export const metadata: Metadata = {
  title: 'OdysseusBot',
  description:
    "Ce que fait le robot OdysseusBot lors de la visite d'un site : pages consultées, fréquence des requêtes, données conservées et durée, moyens de l'identifier ou de le bloquer.",
  alternates: { canonical: '/bot' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/bot',
    title: 'OdysseusBot',
    description:
      "Ce que fait le robot OdysseusBot lors de la visite d'un site : pages consultées, fréquence des requêtes, données conservées et durée, moyens de l'identifier ou de le bloquer.",
  },
};

/**
 * Corrigée le 2026-08-29, milestone 9c plan 009.
 *
 * La page disait que le robot exécutait Lighthouse à chaque visite. C'est
 * vrai pour un audit commandé, faux pour une visite de prospection, qui
 * n'exécute jamais Lighthouse et s'arrête à trois pages. Une page décrivant
 * le robot dont la description ne correspond pas à ce qu'un propriétaire de
 * site observe dans ses propres journaux est pire qu'une absence de page&#160;:
 * c'est le signal de crédibilité qui ne résiste pas à la seule vérification
 * que quiconque ferait. Les deux cas sont désormais décrits séparément.
 *
 * Réécriture éditoriale du 2026-09-10&#160;: texte français rédigé
 * nativement, colonne anglaise traduite du français, mention Lighthouse de
 * l'audit commandé corrigée pour préciser un échantillon de pages
 * (docs/rules/offer-positioning.md section 2), et « auto-entrepreneur »
 * remplacé par « micro-entrepreneur ».
 *
 * Bascule de langue du 2026-09-10&#160;: page entière dupliquée dans
 * `LanguageSection`, pilotée par le sélecteur du bandeau, à la place des
 * deux colonnes toujours visibles et des liens d'ancrage qui ne changeaient
 * rien. Voir `app/offre/page.tsx` pour le même changement, documenté une
 * fois.
 *
 * Mise à jour du 2026-09-11 (plan 037)&#160;: la prospection comporte
 * désormais deux passes. La description de la seconde passe, complète, est
 * ajoutée parce qu'un propriétaire de site la verrait dans ses journaux,
 * et que cette page doit rester vérifiable contre ce qu'il y lit.
 */
export default function BotInfoPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <p className="label">Robot d&apos;analyse</p>
          <h1 className="title measure mt-4">OdysseusBot</h1>
          <p className="lede measure mt-5">
            Ce que fait ce robot lorsqu&apos;il visite un site, ce qu&apos;il conserve, et comment
            lui interdire l&apos;accès.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Odysseus est un outil d&apos;audit technique de sites web. S&apos;il visite votre
              site, c&apos;est dans l&apos;un des deux cas suivants&#160;: un audit a été commandé
              pour ce site, ou le site a été analysé dans le cadre d&apos;une démarche de
              prospection commerciale, pour identifier des problèmes techniques avant une prise de
              contact.
            </p>

            <p>
              Ce que fait le robot dépend du cas, et les deux ne se ressemblent pas dans les
              journaux d&apos;accès de votre serveur.
            </p>

            <p>
              <strong>Audit commandé</strong>&#160;: le robot parcourt le site, charge chaque page
              avec et sans exécution JavaScript pour détecter les écarts de rendu (un problème
              fréquent sur les sites en React ou en Next.js, qui peut les rendre invisibles aux
              moteurs de recherche), et exécute des contrôles automatisés d&apos;accessibilité
              (axe-core) et de performance (Lighthouse) sur une sélection de pages représentatives.
            </p>

            <p>
              <strong>Analyse de prospection</strong>&#160;: dans un premier temps, au plus trois
              pages, et <strong>sans Lighthouse</strong>. Le robot charge chaque page deux fois,
              avec et sans JavaScript, et exécute les contrôles d&apos;accessibilité. Pour un nombre
              restreint d&apos;établissements présélectionnés, une analyse complète du site suit
              ensuite, selon la même méthode et le même rythme de requêtes qu&apos;un audit
              commandé. Dans les deux cas, il ne crée aucun compte, ne soumet aucun formulaire et
              n&apos;effectue aucune réservation.
            </p>

            <p>
              Identification&#160;: l&apos;en-tête User-Agent de ses requêtes contient la mention
              OdysseusBot/1.0. Pour le bloquer, ajoutez ceci à votre fichier robots.txt&#160;:
            </p>

            <pre className="codeblock">
              <code>{'User-agent: OdysseusBot\nDisallow: /'}</code>
            </pre>

            <p>
              Fréquence des requêtes&#160;: une requête toutes les 1000&#160;ms au minimum. Si votre
              fichier robots.txt définit une directive Crawl-delay plus longue, c&apos;est elle qui
              s&apos;applique. Le fichier robots.txt est lu avant toute visite, et les pages
              interdites ne sont jamais chargées.
            </p>

            <p>
              Données conservées&#160;: le rendu des pages et des captures d&apos;écran, à des fins
              d&apos;audit uniquement, supprimées automatiquement après 90 jours. Ces données ne
              sont ni vendues ni partagées avec des tiers. Pour une analyse de prospection,
              l&apos;origine des données, leur usage et la marche à suivre pour s&apos;y opposer
              sont détaillés sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospection et données personnelles
              </a>
              .
            </p>

            <p>
              Contact&#160;: contact@odysseusaudit.com, pour toute question, ou pour demander le
              retrait de votre site de toute analyse en cours ou future. La page{' '}
              <a className="underline" href="/desinscription">
                désinscription
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
        <section className="shell hero">
          <p className="label">Analysis bot</p>
          <h1 className="title measure mt-4">OdysseusBot</h1>
          <p className="lede measure mt-5">
            What this bot does when it visits a site, what it retains, and how to block it.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Odysseus is a website auditing tool. If it visited your site, one of two things is
              happening: an audit was commissioned for this site, or the site was scanned as part of
              prospecting research, to identify technical issues before reaching out.
            </p>

            <p>
              What the bot does depends on the case, and the two do not look alike in your
              server&apos;s access logs.
            </p>

            <p>
              <strong>Commissioned audit</strong>: the bot walks the site, loads each page with and
              without JavaScript execution to detect rendering gaps (a common issue on React and
              Next.js sites, which can make them invisible to search engines), and runs automated
              accessibility checks (axe-core) and performance checks (Lighthouse) on a
              representative sample of pages.
            </p>

            <p>
              <strong>Prospecting analysis</strong>: first, at most three pages, and{' '}
              <strong>without Lighthouse</strong>. The bot loads each page twice, with and without
              JavaScript, and runs the accessibility checks. For a small number of pre-selected
              establishments, a full analysis of the whole site then follows, using the same method
              and the same request pacing as a commissioned audit. In both cases it creates no
              account, submits no form, and makes no booking.
            </p>

            <p>
              Identification: the User-Agent header on its requests carries the token
              OdysseusBot/1.0. To block it, add this to your robots.txt file:
            </p>

            <pre className="codeblock">
              <code>{'User-agent: OdysseusBot\nDisallow: /'}</code>
            </pre>

            <p>
              Request rate: one request every 1000ms at minimum. If your robots.txt file defines a
              longer Crawl-delay, that value applies instead. robots.txt is read before any page is
              visited, and disallowed pages are never loaded.
            </p>

            <p>
              Data retained: rendered pages and screenshots, for audit purposes only, automatically
              deleted after 90 days. This data is never sold or shared with third parties. For a
              prospecting analysis, where the data came from, what it is used for, and how to object
              are set out on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospecting and personal data
              </a>{' '}
              page.
            </p>

            <p>
              Contact: contact@odysseusaudit.com, for any question, or to opt your site out of any
              current or future scan. The{' '}
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
