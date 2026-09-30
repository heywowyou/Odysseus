import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  "Quelles données Odysseus utilise pour sa prospection, d'où elles proviennent, combien de temps elles sont conservées et comment s'y opposer.";

export const metadata: Metadata = {
  title: 'Prospection et données personnelles',
  description,
  alternates: { canonical: '/confidentialite-prospection' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/confidentialite-prospection',
    title: 'Prospection et données personnelles',
    description,
  },
};

/** Information provided for outreach data collected from public sources. */
export default function ProspectingPrivacyPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="title measure"
          fr="Prospection et données personnelles"
          en="Outreach and personal data"
        />
      </section>
      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            D&apos;où viennent les données utilisées par Odysseus, à quoi elles servent, combien de
            temps elles sont conservées et comment vous opposer à leur utilisation pour la
            prospection.
          </p>
        </section>

        <div className="shell section-tight">
          <nav aria-label="Sommaire" className="measure mb-10">
            <p className="label">Sommaire</p>
            <ol className="toc mt-4">
              <li>
                <a className="evidence-link" href="#objet-confid">
                  Objet de cette page
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#responsable-confid">
                  Responsable du traitement
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#origine-confid">
                  Origine des données
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#analyses-confid">
                  Analyses réalisées sur votre site
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#finalite-confid">
                  Finalité et base légale
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#duree-confid">
                  Durée de conservation
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#destinataires-confid">
                  Destinataires des données
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#droits-confid">
                  Vos droits
                </a>
              </li>
            </ol>
          </nav>

          <section className="prose measure">
            <h2 id="objet-confid">Objet de cette page</h2>

            <p>
              Vous avez peut-être reçu un message d&apos;Odysseus ou un lien vers un aperçu de
              l&apos;analyse de votre site. Les données utilisées n&apos;ont pas été collectées
              directement auprès de vous&#160;: elles proviennent de registres publics et de pages
              accessibles publiquement sur votre site. Le règlement général sur la protection des
              données (RGPD) nous impose notamment de vous indiquer leur origine et leur usage.
              Cette page vous explique précisément quelles données nous utilisons, d&apos;où elles
              proviennent et pourquoi.
            </p>

            <h2 id="responsable-confid">Responsable du traitement</h2>

            <p>
              Jules Fontaine, entreprise individuelle (micro-entrepreneur), France. Contact&#160;:
              contact@odysseusaudit.fr.
            </p>

            <h2 id="origine-confid">Origine des données</h2>

            <ul>
              <li>
                Le fichier des hébergements touristiques classés publié par Atout France sur
                data.gouv.fr, sous licence ouverte. Il fournit le nom commercial de
                l&apos;établissement, son adresse, sa commune, son classement en étoiles, son nombre
                de chambres et le site internet déclaré par l&apos;établissement.
              </li>
              <li>
                Votre site internet&#160;: nous consultons uniquement les pages accessibles
                publiquement et relevons les mesures techniques décrites ci-dessous. Lorsqu&apos;une
                adresse de contact générique y est publiée, par exemple contact@ ou reception@, elle
                peut également être utilisée. Nous ne collectons pas d&apos;adresse nominative et
                n&apos;en reconstituons jamais par déduction.
              </li>
              <li>
                La base Sirene de l&apos;INSEE, en données ouvertes, lorsque votre site publie un
                numéro SIREN ou SIRET&#160;: dénomination, code d&apos;activité et tranche
                d&apos;effectifs déclarée.
              </li>
            </ul>

            <p>
              Nous n&apos;achetons aucun fichier de prospection et ne faisons appel à aucun service
              de vérification d&apos;adresses e-mail.
            </p>

            <h2 id="analyses-confid">Analyses réalisées sur votre site</h2>

            <p>
              Lors de la première analyse, Odysseus consulte au maximum trois pages accessibles
              publiquement&#160;: la page d&apos;accueil, une page de réservation lorsqu&apos;elle
              existe et une page de contenu. Nous comparons le HTML initial au rendu après exécution
              du JavaScript et effectuons des contrôles automatisés d&apos;accessibilité. Nous
              conservons les mesures et les captures d&apos;écran correspondantes.
            </p>

            <p>
              Pour un nombre restreint d&apos;établissements présélectionnés, une analyse complète
              du site est ensuite réalisée selon la même méthode qu&apos;un diagnostic commandé. Les
              mêmes contrôles de contenu sont exécutés sur chaque page accessible, tandis que la
              vitesse de chargement est mesurée sur une sélection de pages. Aucune analyse ne crée
              de compte, ne remplit de formulaire ni n&apos;effectue de réservation.
            </p>

            <p>
              Le document envoyé aux établissements contactés présente une synthèse de cette analyse
              complète&#160;: des totaux et quelques constats résumés. Il ne contient ni capture
              d&apos;écran, ni adresse de page, ni élément technique localisé.
            </p>

            <p>
              Le message peut également contenir un lien permanent vers un exemple de rapport
              complet, à l&apos;adresse <code>/exemple-audit</code>. Lorsque son mécanisme
              facultatif d&apos;attribution est activé, une demande vers un lien opaque de cet
              exemple peut être enregistrée pour mesurer si ce support est utile à la prospection.
              Cette mesure utilise uniquement une empreinte du lien, la date et la version du
              document&#160;: aucun cookie, pixel, script de suivi, paramètre de campagne, adresse
              IP, User-Agent ou Referer n&apos;est conservé. Un système automatisé de sécurité des
              messageries peut déclencher la demande et ce signal ne prouve donc pas une lecture
              humaine. L&apos;attribution est conservée au maximum 90 jours, tandis que le lien mène
              toujours à l&apos;exemple public.
            </p>

            <h2 id="finalite-confid">Finalité et base légale</h2>

            <p>
              Nous utilisons ces données pour identifier les problèmes techniques susceptibles de
              vous être utiles et, lorsqu&apos;un diagnostic paraît pertinent, vous proposer notre
              prestation. Le traitement repose sur notre intérêt légitime à mener une prospection
              commerciale entre professionnels, ciblée sur des établissements dont l&apos;activité
              correspond à notre prestation et assortie d&apos;un moyen simple de s&apos;y opposer.
            </p>

            <h2 id="duree-confid">Durée de conservation</h2>

            <p>
              Les données de prospection, captures d&apos;écran comprises, sont conservées pendant
              90 jours puis supprimées automatiquement. Un aperçu publié cesse d&apos;être
              accessible au bout de 30 jours, soit avant cette échéance. L&apos;attribution
              facultative des demandes vers l&apos;exemple suit la même période de 90 jours&#160;:
              le PDF permanent lui-même n&apos;est pas une donnée de prospect.
            </p>

            <p>
              Pour respecter durablement une opposition à la prospection, nous conservons toutefois
              une empreinte cryptographique du domaine et, le cas échéant, de l&apos;adresse e-mail
              concernés sur une liste d&apos;opposition permanente. Cette liste ne conserve pas ces
              valeurs en clair, uniquement des empreintes qui permettent de les reconnaître si elles
              réapparaissent dans une source publique. Sans cette liste, la suppression des autres
              données au bout de 90 jours pourrait faire réapparaître le même établissement comme un
              nouveau prospect.
            </p>

            <h2 id="destinataires-confid">Destinataires des données</h2>

            <p>
              Ces données ne sont communiquées à aucun tiers pour son propre usage, et ne sont ni
              vendues ni louées. Cinq prestataires techniques interviennent&#160;: Hostinger, qui
              héberge le serveur réalisant les analyses et conservant leurs résultats&#160;;
              Scaleway, qui héberge les aperçus publiés en France (région de Paris)&#160;; Vercel,
              qui héberge ce site&#160;; MongoDB Atlas, qui héberge la base de données également en
              France (AWS Paris, eu-west-3)&#160;; et OpenAI, qui fournit le modèle de langage
              utilisé pour rédiger le rapport issu d&apos;une analyse complète. OpenAI reçoit les
              résultats des outils de mesure, dont les adresses des pages, les éléments concernés et
              de courts extraits de code, ainsi que des images des pages du rapport pour en
              contrôler la mise en page. Il ne reçoit jamais le code HTML complet ni le contenu
              intégral des pages. OpenAI étant établi aux États-Unis, ce transfert est encadré par
              les garanties prévues par le RGPD. Les aperçus sont stockés dans un espace privé et ne
              sont accessibles qu&apos;au moyen du lien qui vous a été envoyé.
            </p>

            <p>
              L&apos;exemple permanent de rapport est stocké dans un espace Scaleway distinct des
              aperçus, avec un pointeur de version qui permet son remplacement sans modifier les
              anciens messages. Lorsque l&apos;attribution facultative est activée, les reçus
              techniques sont déposés dans un préfixe séparé, puis consommés par l&apos;interface
              privée.
            </p>

            <h2 id="droits-confid">Vos droits</h2>

            <p>
              Vous disposez d&apos;un droit d&apos;accès, de rectification et d&apos;effacement de
              vos données, d&apos;un droit à la limitation de leur traitement et d&apos;un droit
              d&apos;opposition à la prospection. Écrivez à contact@odysseusaudit.fr, ou répondez
              simplement au message que vous avez reçu. La démarche est gratuite et ne requiert
              aucune justification. La page{' '}
              <a className="underline" href="/desinscription">
                ne plus être contacté
              </a>{' '}
              explique la marche à suivre. Vous pouvez également introduire une réclamation auprès
              de la Commission nationale de l&apos;informatique et des libertés (CNIL).
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            Where the data Odysseus uses for outreach comes from, what it is used for, how long we
            keep it, and how to object.
          </p>
        </section>

        <div className="shell section-tight">
          <nav aria-label="Table of contents" className="measure mb-10">
            <p className="label">Table of contents</p>
            <ol className="toc mt-4">
              <li>
                <a className="evidence-link" href="#objet-confid-en">
                  Purpose of this page
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#responsable-confid-en">
                  Data controller
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#origine-confid-en">
                  Sources of the data
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#analyses-confid-en">
                  Checks carried out on your site
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#finalite-confid-en">
                  Purpose and legal basis
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#duree-confid-en">
                  Retention period
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#destinataires-confid-en">
                  Recipients of the data
                </a>
              </li>
              <li>
                <a className="evidence-link" href="#droits-confid-en">
                  Your rights
                </a>
              </li>
            </ol>
          </nav>

          <section className="prose measure">
            <h2 id="objet-confid-en">Purpose of this page</h2>

            <p>
              You may have received a message from Odysseus or a link to a preview of an analysis of
              your website. The data was not collected directly from you; it comes from public
              registers and publicly accessible pages on your site. The General Data Protection
              Regulation (GDPR) requires us, among other things, to explain where that data comes
              from and how we use it. This page sets out exactly what we use and why.
            </p>

            <h2 id="responsable-confid-en">Data controller</h2>

            <p>
              Jules Fontaine, sole proprietorship (micro-entrepreneur), France. Contact:
              contact@odysseusaudit.fr.
            </p>

            <h2 id="origine-confid-en">Sources of the data</h2>

            <ul>
              <li>
                The classified tourist accommodation dataset published by Atout France on
                data.gouv.fr under an open licence. It provides the establishment&apos;s trading
                name, address, municipality, star rating, number of rooms and the website declared
                by the establishment.
              </li>
              <li>
                Your website: we access only publicly available pages and record the technical
                measurements described below. Where the site publishes a generic contact address,
                such as contact@ or reception@, that address may also be used. We do not collect
                personal email addresses and never reconstruct one by inference.
              </li>
              <li>
                INSEE&apos;s Sirene open data, when your site publishes a SIREN or SIRET number:
                company name, activity code and declared workforce band.
              </li>
            </ul>

            <p>We do not buy outreach lists or use email verification services.</p>

            <h2 id="analyses-confid-en">Checks carried out on your site</h2>

            <p>
              During the initial analysis, Odysseus accesses no more than three publicly available
              pages: the homepage, a booking page where one exists, and one content page. We compare
              the initial HTML with the page after JavaScript has run and perform automated
              accessibility checks. We retain the resulting measurements and screenshots.
            </p>

            <p>
              For a small number of pre-selected establishments, a full-site analysis then follows
              using the same method as a commissioned diagnostic. The same content checks are run on
              every accessible page, while loading performance is measured on a selection of pages.
              No analysis creates an account, fills in a form or makes a booking.
            </p>

            <p>
              The document sent to contacted establishments is a summary of that full analysis: it
              contains totals and a small number of summarised findings. It contains no screenshots,
              page addresses or precisely located technical elements.
            </p>

            <p>
              The message may also contain a permanent link to an example of a full report at
              <code>/exemple-audit</code>. When its optional attribution mechanism is enabled, a
              request to an opaque example-link URL may be recorded to understand whether this
              material is useful for outreach. It uses only a link hash, the request time and the
              document version: no cookie, pixel, tracking script, campaign parameter, IP address,
              User-Agent or Referer is stored. An automated email-security system may make the
              request, so the signal is not proof that a person read the report. Attribution is kept
              for at most 90 days, while the link itself continues to lead to the public example.
            </p>

            <h2 id="finalite-confid-en">Purpose and legal basis</h2>

            <p>
              We use this data to identify technical issues that may be useful to bring to your
              attention and, where a diagnostic appears relevant, to offer our service. The
              processing relies on our legitimate interest in carrying out targeted business-to-
              business outreach to establishments whose activity matches the service, with a simple
              way to object.
            </p>

            <h2 id="duree-confid-en">Retention period</h2>

            <p>
              Outreach data, including screenshots, is retained for 90 days and then deleted
              automatically. A published preview stops being accessible after 30 days, before that
              retention period ends. Optional reference-link attribution mappings follow the same
              90-day period; the permanent example PDF itself is not prospect data.
            </p>

            <p>
              To keep an opt-out effective over time, we retain a cryptographic fingerprint of the
              domain and, where applicable, the email address on a permanent suppression list. The
              list does not store those values in plain text, only fingerprints that allow us to
              recognise them if they reappear in a public source. Without that list, deleting the
              other data after 90 days could cause the same establishment to appear again as a new
              prospect.
            </p>

            <h2 id="destinataires-confid-en">Recipients of the data</h2>

            <p>
              This data is not disclosed to any third party for its own use and is neither sold nor
              rented. Five technical providers are involved: Hostinger, which hosts the server that
              runs the analyses and keeps their results; Scaleway, which hosts published previews in
              France (Paris region); Vercel, which hosts this site; MongoDB Atlas, which also hosts
              the database in France (AWS Paris, eu-west-3); and OpenAI, which provides the language
              model used to write the report from a full analysis. OpenAI receives the results of
              the measurement tools, including page addresses, the elements concerned and short code
              excerpts, as well as images of the report pages so that their layout can be checked.
              It never receives the complete HTML or the full content of the pages. As OpenAI is
              established in the United States, this transfer is covered by the safeguards provided
              for by the GDPR. Previews are stored in a private space and can be accessed only
              through the link sent to you.
            </p>

            <p>
              The permanent example report is stored in a Scaleway space separate from previews,
              with a version pointer so it can be replaced without changing older messages. When
              optional attribution is enabled, technical receipts are written to a separate prefix
              and then consumed by the private interface.
            </p>

            <h2 id="droits-confid-en">Your rights</h2>

            <p>
              You have the right to access, rectify and erase your data, to restrict its processing,
              and to object to its use for outreach. Email contact@odysseusaudit.fr or simply reply
              to the message you received. The process is free and you do not need to give a reason.
              The{' '}
              <a className="underline" href="/desinscription">
                opt-out page
              </a>{' '}
              explains what to do. You may also lodge a complaint with the CNIL, the French data
              protection authority.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
