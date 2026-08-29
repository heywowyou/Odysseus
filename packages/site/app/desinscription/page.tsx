import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Désinscription | Odysseus',
  description: 'Comment ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.',
};

/**
 * The opt-out route, milestone 9c plan 009.
 *
 * Deliberately a mailto and a written explanation rather than a form with a
 * button. An unauthenticated form writing to the suppression list would let
 * anyone suppress anyone, and a form that only sends an email while looking
 * like a database action would be a claim we cannot keep. What actually happens
 * is a person reading the message and running a command, so that is what the
 * page says.
 */
const MAILTO =
  'mailto:contact@odysseusaudit.com' +
  '?subject=Opposition%20a%20la%20prospection%20%2F%20Opt-out' +
  '&body=Bonjour%2C%0A%0AJe%20demande%20a%20ne%20plus%20etre%20contacte%20et%20le%20retrait%20' +
  'de%20tout%20apercu%20en%20ligne%20concernant%20mon%20etablissement.%0A%0ASite%20concerne%20%3A%20';

export default function OptOutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-bold">Ne plus être contacté</h1>

      <section>
        <p className="mb-4">
          Envoyez un message à contact@odysseusaudit.com, ou répondez simplement à celui que vous
          avez reçu. Une phrase suffit, aucune justification n&apos;est demandée et c&apos;est
          gratuit.
        </p>

        <p className="mb-6">
          <a
            className="inline-block rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            href={MAILTO}
          >
            Écrire pour se désinscrire
          </a>
        </p>

        <h2 className="mb-4 text-xl font-semibold">Ce qui se passe ensuite</h2>

        <p className="mb-4">
          Le message est lu par une personne, pas par un automate : il n&apos;y a pas de traitement
          automatique derrière ce bouton, et nous préférons le dire plutôt que de laisser croire le
          contraire. Concrètement, trois choses sont faites.
        </p>

        <ul className="mb-4 list-disc pl-6">
          <li className="mb-2">
            Tout aperçu en ligne concernant votre établissement est retiré. Le lien cesse
            immédiatement de fonctionner et le document est supprimé de son espace de stockage.
          </li>
          <li className="mb-2">
            Votre domaine, et l&apos;adresse email si vous en indiquez une, sont inscrits sur une
            liste d&apos;opposition permanente. Elle ne contient que des empreintes cryptographiques
            : elle permet de reconnaître votre domaine s&apos;il réapparaît dans une source
            publique, mais pas de reconstituer votre adresse.
          </li>
          <li className="mb-2">
            Les autres données de prospection vous concernant sont supprimées, comme elles
            l&apos;auraient été de toute façon au bout de quatre-vingt-dix jours.
          </li>
        </ul>

        <p className="mb-4">
          La liste d&apos;opposition est vérifiée avant chaque prise de contact et avant chaque
          publication d&apos;aperçu. Elle n&apos;est jamais purgée : c&apos;est précisément parce
          que le reste est supprimé au bout de quatre-vingt-dix jours qu&apos;elle doit survivre,
          sans quoi la suppression vous ferait réapparaître comme un nouveau prospect.
        </p>

        <p className="mb-4">
          Pour empêcher toute visite future de notre robot sur votre site, sans nous écrire, ajoutez
          la règle indiquée sur la page{' '}
          <a className="underline" href="/bot">
            OdysseusBot
          </a>{' '}
          à votre fichier robots.txt. Le détail de ce que nous collectons et pourquoi est sur la
          page{' '}
          <a className="underline" href="/confidentialite-prospection">
            prospection et données personnelles
          </a>
          .
        </p>
      </section>

      <hr className="my-8" />

      <section lang="en">
        <h1 className="mb-8 text-2xl font-bold">Stop being contacted</h1>

        <p className="mb-4">
          Send a message to contact@odysseusaudit.com, or simply reply to the one you received. A
          single sentence is enough, no justification is required, and it is free.
        </p>

        <p className="mb-6">
          <a
            className="inline-block rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            href={MAILTO}
          >
            Write to opt out
          </a>
        </p>

        <h2 className="mb-4 text-xl font-semibold">What happens next</h2>

        <p className="mb-4">
          A person reads the message, not an automated system: there is no automatic processing
          behind that button, and we would rather say so than let you assume otherwise. Three things
          are then done.
        </p>

        <ul className="mb-4 list-disc pl-6">
          <li className="mb-2">
            Any online preview concerning your establishment is withdrawn. The link stops working
            immediately and the document is deleted from its storage.
          </li>
          <li className="mb-2">
            Your domain, and your email address if you give one, go on a permanent objection list.
            It holds cryptographic fingerprints only: it lets us recognise your domain if it
            reappears in a public source, but it cannot be turned back into your address.
          </li>
          <li className="mb-2">
            The other prospecting data about you is deleted, as it would have been in any case after
            ninety days.
          </li>
        </ul>

        <p className="mb-4">
          The objection list is checked before every contact and before every preview is published.
          It is never purged: it has to outlive everything else precisely because the rest is
          deleted after ninety days, or that deletion would make you reappear as a new prospect.
        </p>

        <p className="mb-4">
          To stop our crawler visiting your site at all, without writing to us, add the rule shown
          on the{' '}
          <a className="underline" href="/bot">
            OdysseusBot
          </a>{' '}
          page to your robots.txt file. What we collect and why is set out on the{' '}
          <a className="underline" href="/confidentialite-prospection">
            prospecting and personal data
          </a>{' '}
          page.
        </p>
      </section>
    </main>
  );
}
