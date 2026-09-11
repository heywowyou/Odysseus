import type { Metadata } from 'next';
import { LanguageSection } from '../../lib/language';

export const metadata: Metadata = {
  title: 'Désinscription',
  description: 'Comment ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.',
  alternates: { canonical: '/desinscription' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/desinscription',
    title: 'Désinscription',
    description: 'Comment ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.',
  },
};

/**
 * La voie d'opposition, milestone 9c plan 009.
 *
 * Délibérément un lien mailto et une explication écrite, plutôt qu'un
 * formulaire avec un bouton. Un formulaire non authentifié écrivant sur la
 * liste de suppression permettrait à quiconque de supprimer n'importe qui, et
 * un formulaire qui se contente d'envoyer un e-mail tout en ayant
 * l'apparence d'une action en base de données serait une promesse que nous
 * ne tenons pas. Ce qui se passe réellement, c'est qu'une personne lit le
 * message et exécute une commande&#160;: c'est donc ce que dit la page.
 *
 * Réécriture éditoriale du 2026-09-10&#160;: texte français rédigé
 * nativement, colonne anglaise traduite du français, et le sujet/corps du
 * message pré-rempli reconstruit avec `encodeURIComponent` pour porter les
 * accents corrects (l'ancienne version, translittérée à la main, arrivait
 * sans accents dans le client de messagerie du destinataire).
 *
 * Bascule de langue du 2026-09-10&#160;: page entière dupliquée dans
 * `LanguageSection`, pilotée par le sélecteur du bandeau. Voir
 * `app/offre/page.tsx` pour le même changement, documenté une fois.
 */
const MAILTO_SUBJECT = 'Opposition à la prospection';
const MAILTO_BODY =
  'Bonjour,\n\n' +
  'Je vous demande de ne plus me contacter et de retirer tout aperçu en ligne concernant mon établissement.\n\n' +
  'Site concerné : ';
const MAILTO =
  `mailto:contact@odysseusaudit.com?subject=${encodeURIComponent(MAILTO_SUBJECT)}` +
  `&body=${encodeURIComponent(MAILTO_BODY)}`;

export default function OptOutPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <h1 className="title measure">Ne plus être contacté</h1>
          <p className="lede measure mt-5">
            Une simple demande suffit. Elle est gratuite et ne requiert aucune justification.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Envoyez un message à contact@odysseusaudit.com, ou répondez simplement à celui que
              vous avez reçu.
            </p>

            <p>
              <a className="btn btn-primary" href={MAILTO}>
                Demander la désinscription par e-mail
              </a>
            </p>

            <h2>Suite donnée à votre demande</h2>

            <p>
              Votre message est lu par une personne&#160;: ce bouton ne déclenche aucun traitement
              automatique, et nous préférons l&apos;indiquer clairement. Trois mesures sont ensuite
              prises.
            </p>

            <ul>
              <li>
                Tout aperçu en ligne concernant votre établissement est retiré. Le lien cesse
                immédiatement de fonctionner et le document est supprimé de son espace de stockage.
              </li>
              <li>
                Votre domaine, et votre adresse e-mail si vous en indiquez une, sont inscrits sur
                une liste d&apos;opposition permanente. Elle ne contient pas votre adresse
                elle-même, seulement des empreintes qui permettent de reconnaître votre domaine
                s&apos;il réapparaît dans une source publique.
              </li>
              <li>
                Les autres données de prospection vous concernant sont supprimées, comme elles
                l&apos;auraient été de toute façon au bout de quatre-vingt-dix jours.
              </li>
            </ul>

            <p>
              La liste d&apos;opposition est vérifiée avant chaque prise de contact et avant chaque
              publication d&apos;aperçu. Elle n&apos;est jamais purgée&#160;: c&apos;est précisément
              parce que le reste est supprimé au bout de quatre-vingt-dix jours qu&apos;elle doit
              subsister, sans quoi la suppression vous ferait réapparaître comme un nouveau
              prospect.
            </p>

            <p>
              Pour empêcher toute visite future de notre robot sur votre site, sans nous écrire,
              ajoutez la règle indiquée sur la page{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>{' '}
              à votre fichier robots.txt. Le détail de ce que nous collectons, et pourquoi, figure
              sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospection et données personnelles
              </a>
              .
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <h1 className="title measure">Stop being contacted</h1>
          <p className="lede measure mt-5">
            A simple request is enough. It is free and requires no justification.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Send a message to contact@odysseusaudit.com, or simply reply to the one you received.
            </p>

            <p>
              <a className="btn btn-primary" href={MAILTO}>
                Request opt-out by email
              </a>
            </p>

            <h2>What happens next</h2>

            <p>
              A person reads the message: there is no automatic processing behind that button, and
              we would rather say so clearly. Three things are then done.
            </p>

            <ul>
              <li>
                Any online preview concerning your establishment is withdrawn. The link stops
                working immediately and the document is deleted from its storage.
              </li>
              <li>
                Your domain, and your email address if you give one, go on a permanent objection
                list. It does not hold your address itself, only fingerprints that let us recognise
                your domain if it reappears in a public source.
              </li>
              <li>
                The other prospecting data about you is deleted, as it would have been in any case
                after ninety days.
              </li>
            </ul>

            <p>
              The objection list is checked before every contact and before every preview is
              published. It is never purged: it has to outlive everything else precisely because the
              rest is deleted after ninety days, or that deletion would make you reappear as a new
              prospect.
            </p>

            <p>
              To stop our crawler visiting your site at all, without writing to us, add the rule
              shown on the{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>{' '}
              page to your robots.txt file. What we collect, and why, is set out on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospecting and personal data
              </a>{' '}
              page.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
