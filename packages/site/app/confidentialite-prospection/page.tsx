import type { Metadata } from 'next';
import { LanguageSection } from '../../lib/language';

export const metadata: Metadata = {
  title: 'Prospection et données personnelles',
  description:
    "Comment Odysseus obtient et utilise les données des établissements contactés, et comment s'y opposer.",
  alternates: { canonical: '/confidentialite-prospection' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/confidentialite-prospection',
    title: 'Prospection et données personnelles',
    description:
      "Comment Odysseus obtient et utilise les données des établissements contactés, et comment s'y opposer.",
  },
};

/**
 * L'information RGPD article 14 pour la prospection, milestone 9c plan 009.
 *
 * L'article 14 s'applique parce qu'aucune de ces données n'a été collectée
 * auprès de la personne concernée : l'information doit donc être accessible
 * et précise (les sources exactes, pas « des sources publiques »), et la voie
 * d'opposition doit être réelle plutôt qu'un formulaire sans destinataire.
 * L'aperçu de prospection renvoie ici par contrat (son schéma exige un lien
 * de confidentialité sur cet hôte) : cette page fait donc partie du document,
 * ce n'est pas une documentation annexe.
 *
 * Réécriture éditoriale du 2026-09-10&#160;: intitulés alignés sur le
 * vocabulaire RGPD standard (objet, responsable du traitement, origine des
 * données, finalité et base légale, durée de conservation, destinataires,
 * droits), texte français rédigé nativement en registre professionnel, et
 * colonne anglaise traduite du français. Le sens de chaque affirmation
 * approuvée est inchangé.
 *
 * Bascule de langue du 2026-09-10&#160;: page entière dupliquée dans
 * `LanguageSection`, pilotée par le sélecteur du bandeau, à la place des
 * deux colonnes toujours visibles. Voir `app/offre/page.tsx` pour le même
 * changement, documenté une fois.
 */
export default function ProspectingPrivacyPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <h1 className="title measure">Prospection et données personnelles</h1>
          <p className="lede measure mt-5">
            L&apos;origine des données que nous détenons sur votre établissement, leur utilisation,
            leur durée de conservation et la manière de vous y opposer.
          </p>
        </section>

        <div className="shell section-tight">
          {/* Sommaire ajouté le 2026-09-11 (impeccable, critique P2 :
              « pas d'ancrage, pas de sommaire »). Reprend les huit titres
              ci-dessous mot pour mot ; aucune formulation nouvelle. */}
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
              Vous avez sans doute reçu un message d&apos;Odysseus, ou un lien vers un aperçu
              d&apos;analyse de votre site. Les données utilisées n&apos;ont pas été collectées
              auprès de vous&#160;: elles proviennent de registres publics et de votre propre site.
              Dans ce cas, le règlement général sur la protection des données (RGPD) nous impose de
              vous en indiquer précisément l&apos;origine et l&apos;usage. Tel est l&apos;objet de
              cette page.
            </p>

            <h2 id="responsable-confid">Responsable du traitement</h2>

            <p>
              Jules Fontaine, entreprise individuelle (micro-entrepreneur), France. Contact&#160;:
              contact@odysseusaudit.fr. Les messages adressés à cette adresse sont lus par une
              personne, et non traités automatiquement.
            </p>

            <h2 id="origine-confid">Origine des données</h2>

            <ul>
              <li>
                Le fichier des hébergements touristiques classés publié par Atout France sur
                data.gouv.fr, sous licence ouverte. Il fournit le nom commercial de
                l&apos;établissement, son adresse, sa commune, son classement en étoiles, son nombre
                de chambres et le site internet que l&apos;établissement a lui-même déclaré.
              </li>
              <li>
                Votre site internet, consulté comme le ferait tout visiteur&#160;: les mesures
                techniques décrites ci-dessous, et le cas échéant une adresse de contact générique
                publiée sur le site (par exemple contact@ ou reception@). Nous ne collectons jamais
                d&apos;adresse nominative, et ne reconstituons jamais une adresse par déduction.
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
              La première passe consulte au plus trois pages, publiquement, comme le ferait un
              visiteur&#160;: votre page d&apos;accueil, une page de réservation lorsqu&apos;elle
              existe, et une page de contenu. Nous mesurons les écarts d&apos;affichage entre la
              page brute et la page après exécution du JavaScript, et nous effectuons des contrôles
              d&apos;accessibilité automatisés. Nous conservons des captures d&apos;écran et ces
              mesures.
            </p>

            <p>
              Pour un nombre restreint d&apos;établissements présélectionnés, une seconde passe
              analyse l&apos;ensemble du site, selon la même méthode qu&apos;un audit
              commandé&#160;: chaque page consultée reçoit les mêmes contrôles, et la vitesse de
              chargement est mesurée sur un échantillon représentatif de pages. Aucune passe ne crée
              de compte, ne remplit de formulaire et n&apos;effectue de réservation.
            </p>

            <p>
              Le document envoyé aux établissements contactés présente une synthèse de la seconde
              passe&#160;: des totaux et quelques constats résumés. Il ne contient ni capture
              d&apos;écran, ni adresse de page, ni élément technique localisé.
            </p>

            <h2 id="finalite-confid">Finalité et base légale</h2>

            <p>
              Ces données servent à vous proposer une prestation d&apos;audit de site web, et à ne
              vous contacter que si l&apos;analyse a relevé des éléments utiles à vous signaler. Le
              traitement repose sur l&apos;intérêt légitime&#160;: une prospection entre
              professionnels, ciblée sur des établissements dont l&apos;activité correspond à la
              prestation, assortie d&apos;un moyen simple de s&apos;y opposer.
            </p>

            <h2 id="duree-confid">Durée de conservation</h2>

            <p>
              Les données de prospection, captures d&apos;écran comprises, sont conservées
              quatre-vingt-dix jours. Leur suppression est automatique&#160;: elle est exécutée par
              la base de données elle-même, sans intervention manuelle. Un aperçu publié cesse
              d&apos;être accessible au bout de trente jours, soit avant cette échéance.
            </p>

            <p>
              Une exception existe, dans votre intérêt&#160;: si vous vous opposez à la prospection,
              nous inscrivons une empreinte cryptographique de votre domaine et de votre adresse sur
              une liste d&apos;opposition permanente, afin de ne jamais vous recontacter. Cette
              liste ne conserve pas l&apos;adresse elle-même, seulement une empreinte qui permet de
              la reconnaître si elle réapparaît dans une source publique. Sans cette liste, la
              suppression au bout de quatre-vingt-dix jours vous ferait réapparaître comme un
              nouveau prospect.
            </p>

            <h2 id="destinataires-confid">Destinataires des données</h2>

            <p>
              Ces données ne sont communiquées à aucun tiers pour son propre usage, et ne sont ni
              vendues ni louées. Trois prestataires techniques interviennent&#160;: Scaleway, qui
              héberge les aperçus publiés en France (région de Paris)&#160;; Vercel, qui héberge ce
              site&#160;; et MongoDB Atlas, qui héberge la base de données également en France (AWS
              Paris, eu-west-3). Les aperçus sont stockés dans un espace privé et ne sont
              accessibles que par le lien qui vous a été envoyé.
            </p>

            <h2 id="droits-confid">Vos droits</h2>

            <p>
              Vous disposez d&apos;un droit d&apos;accès, de rectification et d&apos;effacement de
              vos données, d&apos;un droit à la limitation de leur traitement et d&apos;un droit
              d&apos;opposition à la prospection. Écrivez à contact@odysseusaudit.fr, ou répondez
              simplement au message que vous avez reçu. La démarche est gratuite et ne requiert
              aucune justification. La page{' '}
              <a className="underline" href="/desinscription">
                désinscription
              </a>{' '}
              en explique la marche à suivre. Vous pouvez également introduire une réclamation
              auprès de la Commission nationale de l&apos;informatique et des libertés (CNIL).
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <h1 className="title measure">Prospecting and personal data</h1>
          <p className="lede measure mt-5">
            Where the data we hold about your establishment comes from, how it is used, how long we
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
              You have probably received a message from Odysseus, or a link to a preview of an
              analysis of your website. The data used was not collected from you: it comes from
              public registers and from your own site. In that case, the General Data Protection
              Regulation (GDPR) requires us to tell you precisely where it came from and how it is
              used. That is the purpose of this page.
            </p>

            <h2 id="responsable-confid-en">Data controller</h2>

            <p>
              Jules Fontaine, sole proprietorship (micro-entrepreneur), France. Contact:
              contact@odysseusaudit.fr. Messages sent to this address are read by a person, not
              processed automatically.
            </p>

            <h2 id="origine-confid-en">Sources of the data</h2>

            <ul>
              <li>
                The classified tourist accommodation file published by Atout France on data.gouv.fr
                under an open licence. It supplies the establishment&apos;s trading name, address,
                commune, star rating, room count, and the website the establishment declared itself.
              </li>
              <li>
                Your website, viewed publicly as any visitor would: the technical measurements
                described below, and where applicable a generic contact address published on the
                site (contact@ or reception@, for example). We never collect a named
                individual&apos;s address, and never reconstruct an address by inference.
              </li>
              <li>
                INSEE&apos;s Sirene open data, when your site publishes a SIREN or SIRET number:
                company name, activity code, and declared headcount band.
              </li>
            </ul>

            <p>We buy no prospecting lists, and use no email verification service.</p>

            <h2 id="analyses-confid-en">Checks carried out on your site</h2>

            <p>
              The first pass views at most three pages, publicly, as a visitor would: your homepage,
              a booking page where one exists, and a content page. We measure the display gaps
              between the raw page and the page once JavaScript has run, and we run automated
              accessibility checks. We keep screenshots and those measurements.
            </p>

            <p>
              For a small number of pre-selected establishments, a second pass analyses the whole
              site, using the same method as a commissioned audit: every viewed page receives the
              same checks, and loading speed is measured on a representative sample of pages.
              Neither pass creates an account, fills in a form, or makes a booking.
            </p>

            <p>
              The document sent to contacted establishments is a summary of the second pass: totals
              and a few summarised findings. It contains no screenshot, no page address, and no
              located technical element.
            </p>

            <h2 id="finalite-confid-en">Purpose and legal basis</h2>

            <p>
              This data is used to offer you a website audit, and to contact you only where the
              analysis has found something worth pointing out. The processing relies on legitimate
              interest: business to business prospecting, targeted at establishments whose activity
              matches the service, with a simple way to object.
            </p>

            <h2 id="duree-confid-en">Retention period</h2>

            <p>
              Ninety days: that is how long prospecting data, screenshots included, is kept.
              Deletion is automatic, carried out by the database itself with no manual step. A
              published preview stops being reachable after thirty days, which is before that
              deadline.
            </p>

            <p>
              One exception exists, in your favour: if you object to prospecting, we record a
              cryptographic fingerprint of your domain and your address on a permanent objection
              list, so that we never contact you again. This list does not retain the address
              itself, only a fingerprint that lets us recognise it if it reappears in a public
              source. Without this list, deleting everything after ninety days would make you
              reappear as a new prospect.
            </p>

            <h2 id="destinataires-confid-en">Recipients of the data</h2>

            <p>
              This data is not shared with any third party for its own purposes, and is neither sold
              nor rented. Three technical providers are involved: Scaleway, which hosts published
              previews in France (Paris region); Vercel, which hosts this site; and MongoDB Atlas,
              which also hosts the database in France (AWS Paris, eu-west-3). Previews are stored
              privately and are reachable only through the link sent to you.
            </p>

            <h2 id="droits-confid-en">Your rights</h2>

            <p>
              You have a right of access, rectification and erasure of your data, a right to
              restrict its processing, and a right to object to prospecting. Write to
              contact@odysseusaudit.fr, or simply reply to the message you received. The process is
              free and requires no justification. The{' '}
              <a className="underline" href="/desinscription">
                opt-out page
              </a>{' '}
              explains how. You may also lodge a complaint with the CNIL, the French data protection
              authority.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
