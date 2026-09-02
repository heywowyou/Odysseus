import type { Metadata } from 'next';

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
 * The RGPD article 14 disclosure for prospecting, milestone 9c plan 009.
 *
 * Article 14 applies because none of this data was collected from the person
 * it concerns, so the disclosure has to be reachable and specific: the exact
 * sources, not "public sources", and a real objection route rather than a form
 * that goes nowhere. The outreach preview links here by contract - the preview
 * schema requires a privacy link on this host - so this page is not optional
 * documentation, it is part of the document.
 *
 * Written FR and EN together rather than translated afterwards, per the
 * repository's own rule about user-facing strings.
 *
 * The two languages sit side by side on wide screens and stack below that,
 * with the anchored language links above them. Presentation only: not a word
 * of the disclosure itself changed when this pattern was added (plan 022
 * step 7).
 */
export default function ProspectingPrivacyPage() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto max-w-2xl flex-1 px-6 py-12 lg:max-w-6xl">
      <h1 className="mb-4 text-2xl font-bold">Prospection et données personnelles</h1>

      <nav aria-label="Langues" className="mb-10 flex gap-6 text-sm">
        <a className="underline" href="#francais">
          Français
        </a>
        <a className="underline" href="#english">
          English
        </a>
      </nav>

      <div className="lg:grid lg:grid-cols-2 lg:gap-12">
        <div id="francais" className="border-t border-black/10 pt-8 dark:border-white/10">
          <section>
            <p className="mb-6 text-sm font-medium text-black/60 dark:text-white/60">Français</p>

            <h2 className="mb-4 text-xl font-semibold">Pourquoi vous lisez cette page</h2>

            <p className="mb-4">
              Vous avez probablement reçu un message d&apos;Odysseus, ou un lien vers un aperçu
              d&apos;analyse de votre site. Nous ne vous avons rien demandé avant de constituer ce
              dossier : les données viennent de registres publics et de votre propre site. Le
              règlement européen sur la protection des données impose, dans ce cas, de vous dire
              précisément d&apos;où elles viennent et ce que nous en faisons. C&apos;est
              l&apos;objet de cette page.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Qui est responsable</h2>

            <p className="mb-4">
              Jules Fontaine, entreprise individuelle (auto-entrepreneur), France. Contact :
              contact@odysseusaudit.com. Cette adresse est relevée par une personne, pas par un
              automate.
            </p>

            <h2 className="mb-4 text-xl font-semibold">D&apos;où viennent les données</h2>

            <ul className="mb-4 list-disc pl-6">
              <li className="mb-2">
                Le fichier des hébergements touristiques classés publié par Atout France sur
                data.gouv.fr, sous licence ouverte. Il fournit le nom commercial de
                l&apos;établissement, son adresse, sa commune, son classement en étoiles, son nombre
                de chambres et le site internet que l&apos;établissement a lui-même déclaré.
              </li>
              <li className="mb-2">
                Votre propre site internet, consulté publiquement : les mesures techniques décrites
                ci-dessous, et le cas échéant une adresse de contact générique publiée sur le site
                (par exemple contact@ ou reception@). Nous ne collectons jamais une adresse
                nominative, et nous ne devinons jamais une adresse.
              </li>
              <li className="mb-2">
                La base Sirene de l&apos;INSEE, en données ouvertes, lorsque votre site publie un
                numéro SIREN ou SIRET : dénomination, code d&apos;activité et tranche
                d&apos;effectifs déclarée.
              </li>
            </ul>

            <p className="mb-4">
              Nous n&apos;achetons aucun fichier de prospection, et nous n&apos;utilisons aucun
              prestataire de vérification d&apos;adresses email.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Ce que nous mesurons sur votre site</h2>

            <p className="mb-4">
              Au plus trois pages, chargées publiquement comme le ferait un visiteur : votre page
              d&apos;accueil, une page de réservation lorsqu&apos;elle existe, et une page de
              contenu. Nous mesurons les écarts d&apos;affichage entre la page brute et la page une
              fois le JavaScript exécuté, et nous exécutons des vérifications d&apos;accessibilité
              automatisées. Nous conservons des captures d&apos;écran et ces mesures. Nous ne créons
              aucun compte, nous ne remplissons aucun formulaire et nous n&apos;effectuons aucune
              réservation.
            </p>

            <h2 className="mb-4 text-xl font-semibold">À quoi cela sert</h2>

            <p className="mb-4">
              À vous proposer une prestation d&apos;audit de site web, et à ne vous l&apos;écrire
              que si l&apos;analyse a effectivement trouvé quelque chose à vous montrer. La base
              légale est l&apos;intérêt légitime : une prospection entre professionnels, ciblée sur
              des établissements dont l&apos;activité correspond à la prestation, avec un moyen
              simple de s&apos;y opposer.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Combien de temps</h2>

            <p className="mb-4">
              Quatre-vingt-dix jours pour l&apos;ensemble des données de prospection, captures
              d&apos;écran comprises. La suppression est appliquée par la base de données elle-même,
              pas par un passage manuel. Un aperçu publié en ligne cesse d&apos;être accessible au
              bout de trente jours, donc avant cette échéance.
            </p>

            <p className="mb-4">
              Une seule exception, et elle joue en votre faveur : si vous vous opposez, nous
              conservons de façon permanente une empreinte cryptographique de votre domaine et de
              votre adresse, afin de ne jamais vous recontacter. Une empreinte ne permet pas de
              retrouver l&apos;adresse ; elle permet seulement de reconnaître la même adresse si
              elle réapparaît dans une source publique. Sans cela, la suppression au bout de
              quatre-vingt-dix jours vous ferait réapparaître comme un nouveau prospect.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Qui d&apos;autre y a accès</h2>

            <p className="mb-4">
              Personne ne reçoit ces données à des fins qui lui soient propres, et rien n&apos;est
              ni vendu ni loué. Trois prestataires techniques interviennent : Scaleway, qui héberge
              les aperçus publiés en France (région de Paris) ; Vercel, qui héberge ce site ; et
              MongoDB Atlas, qui héberge la base de données en France également (AWS Paris,
              eu-west-3). Les aperçus sont stockés dans un espace privé et ne sont accessibles que
              par le lien qui vous a été envoyé.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Vos droits</h2>

            <p className="mb-4">
              Vous pouvez demander l&apos;accès à vos données, leur rectification, leur effacement,
              la limitation de leur traitement, et vous opposer à la prospection. Écrivez à
              contact@odysseusaudit.com, ou répondez simplement au message que vous avez reçu.
              C&apos;est gratuit et aucune justification n&apos;est demandée. La page{' '}
              <a className="underline" href="/desinscription">
                désinscription
              </a>{' '}
              explique la marche à suivre. Vous pouvez également introduire une réclamation auprès
              de la CNIL.
            </p>
          </section>
        </div>

        <div
          id="english"
          className="mt-12 border-t border-black/10 pt-8 lg:mt-0 dark:border-white/10"
        >
          <section lang="en">
            <p className="mb-6 text-sm font-medium text-black/60 dark:text-white/60">English</p>

            <h2 className="mb-4 text-xl font-semibold">Why you are reading this</h2>

            <p className="mb-4">
              You have probably received a message from Odysseus, or a link to a preview of an
              analysis of your website. We did not ask you before putting that together: the data
              comes from public registers and from your own site. European data protection law
              requires us, in that case, to tell you exactly where it came from and what we do with
              it. That is what this page is for.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Who is responsible</h2>

            <p className="mb-4">
              Jules Fontaine, sole proprietorship (auto-entrepreneur), France. Contact:
              contact@odysseusaudit.com. A person reads that address, not an automated system.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Where the data comes from</h2>

            <ul className="mb-4 list-disc pl-6">
              <li className="mb-2">
                The classified tourist accommodation file published by Atout France on data.gouv.fr
                under an open licence. It supplies the establishment&apos;s trading name, address,
                commune, star rating, room count, and the website the establishment declared itself.
              </li>
              <li className="mb-2">
                Your own website, viewed publicly: the technical measurements described below, and
                where applicable a generic contact address published on the site (contact@ or
                reception@, for example). We never collect a named individual&apos;s address, and we
                never guess an address.
              </li>
              <li className="mb-2">
                INSEE&apos;s Sirene open data, when your site publishes a SIREN or SIRET number:
                company name, activity code, and declared headcount band.
              </li>
            </ul>

            <p className="mb-4">
              We buy no prospecting lists, and we use no email verification vendor.
            </p>

            <h2 className="mb-4 text-xl font-semibold">What we measure on your site</h2>

            <p className="mb-4">
              At most three pages, loaded publicly as a visitor would: your homepage, a booking page
              where one exists, and a content page. We measure the difference between the raw page
              and the page once JavaScript has run, and we run automated accessibility checks. We
              keep screenshots and those measurements. We create no account, submit no form, and
              make no booking.
            </p>

            <h2 className="mb-4 text-xl font-semibold">What it is for</h2>

            <p className="mb-4">
              To offer you a website audit, and to write to you only where the analysis actually
              found something worth showing you. The legal basis is legitimate interest: business to
              business prospecting, aimed at establishments whose activity matches the service, with
              a simple way to object.
            </p>

            <h2 className="mb-4 text-xl font-semibold">For how long</h2>

            <p className="mb-4">
              Ninety days for all prospecting data, screenshots included. Deletion is enforced by
              the database itself, not by a manual pass. A published preview stops being reachable
              after thirty days, so before that deadline.
            </p>

            <p className="mb-4">
              One exception, and it works in your favour: if you object, we keep a permanent
              cryptographic fingerprint of your domain and address so that we never contact you
              again. A fingerprint cannot be turned back into an address; it only lets us recognise
              the same address if it reappears in a public source. Without it, deleting everything
              after ninety days would make you reappear as a new prospect.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Who else has access</h2>

            <p className="mb-4">
              Nobody receives this data for purposes of their own, and nothing is sold or rented.
              Three technical providers are involved: Scaleway, which hosts published previews in
              France (Paris region); Vercel, which hosts this site; and MongoDB Atlas, which hosts
              the database in France as well (AWS Paris, eu-west-3). Previews are stored privately
              and are reachable only through the link sent to you.
            </p>

            <h2 className="mb-4 text-xl font-semibold">Your rights</h2>

            <p className="mb-4">
              You can ask for access to your data, its correction, its deletion, a restriction on
              its processing, and you can object to prospecting. Write to contact@odysseusaudit.com,
              or simply reply to the message you received. It is free and no justification is
              required. The{' '}
              <a className="underline" href="/desinscription">
                opt-out page
              </a>{' '}
              explains how. You may also lodge a complaint with the CNIL, the French data protection
              authority.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
