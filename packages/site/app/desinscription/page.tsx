import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  'Comment demander à ne plus être contacté par Odysseus et faire retirer un aperçu en ligne.';

export const metadata: Metadata = {
  title: 'Ne plus être contacté',
  description,
  alternates: { canonical: '/desinscription' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/desinscription',
    title: 'Ne plus être contacté',
    description,
  },
};

const MAILTO_SUBJECT_FR = 'Opposition à la prospection';
const MAILTO_BODY_FR =
  'Bonjour,\n\n' +
  'Je vous demande de ne plus me contacter et de retirer tout aperçu en ligne concernant mon établissement.\n\n' +
  'Site concerné : ';
const MAILTO_FR =
  `mailto:contact@odysseusaudit.fr?subject=${encodeURIComponent(MAILTO_SUBJECT_FR)}` +
  `&body=${encodeURIComponent(MAILTO_BODY_FR)}`;

const MAILTO_SUBJECT_EN = 'Opt-out request';
const MAILTO_BODY_EN =
  'Hello,\n\n' +
  'Please stop contacting me and remove any online preview concerning my establishment.\n\n' +
  'Website concerned: ';
const MAILTO_EN =
  `mailto:contact@odysseusaudit.fr?subject=${encodeURIComponent(MAILTO_SUBJECT_EN)}` +
  `&body=${encodeURIComponent(MAILTO_BODY_EN)}`;

export default function OptOutPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="title measure"
          fr="Ne plus être contacté"
          en="Opt out of future contact"
        />
      </section>
      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            Vous pouvez vous opposer à toute nouvelle prise de contact, gratuitement et sans avoir à
            vous justifier.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>
              Envoyez un message à contact@odysseusaudit.fr, ou répondez simplement à celui que vous
              avez reçu.
            </p>

            <p>
              <a className="btn btn-primary" href={MAILTO_FR}>
                Demander à ne plus être contacté
              </a>
            </p>

            <h2>Ce qui se passe ensuite</h2>

            <p>
              Ce bouton ouvre simplement votre messagerie&#160;; aucune demande n&apos;est transmise
              automatiquement. Une fois votre message reçu, nous prenons les trois mesures
              suivantes.
            </p>

            <ul>
              <li>
                Tout aperçu en ligne concernant votre établissement est retiré. Le lien cesse
                immédiatement de fonctionner et le document est supprimé de son espace de stockage.
              </li>
              <li>
                Votre domaine, et votre adresse e-mail si vous en indiquez une, sont inscrits sur
                une liste d&apos;opposition permanente. Elle ne conserve pas ces valeurs en clair,
                uniquement des empreintes cryptographiques qui permettent de les reconnaître si
                elles réapparaissent dans une source publique.
              </li>
              <li>
                Les autres données de prospection vous concernant sont supprimées sans attendre
                l&apos;échéance habituelle de 90 jours.
              </li>
            </ul>

            <p>
              La liste d&apos;opposition est vérifiée avant chaque prise de contact et chaque
              publication d&apos;aperçu. Les empreintes qu&apos;elle contient sont conservées afin
              que votre opposition reste effective dans le temps, même si vos coordonnées
              réapparaissent ultérieurement dans une source publique.
            </p>

            <p>
              Si vous souhaitez également empêcher OdysseusBot d&apos;accéder à votre site, vous
              pouvez le bloquer directement dans votre fichier robots.txt, sans nous contacter. La
              règle à ajouter est indiquée sur la page{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>
              . Le détail des données collectées et de leur utilisation figure sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                prospection et données personnelles
              </a>
              .
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            You can opt out at any time, free of charge and without giving a reason.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <p>Email contact@odysseusaudit.fr, or simply reply to the message you received.</p>

            <p>
              <a className="btn btn-primary" href={MAILTO_EN}>
                Opt out by email
              </a>
            </p>

            <h2>What happens next</h2>

            <p>
              This button simply opens your email client; it does not submit anything automatically.
              Once we receive your message, we take the following three steps.
            </p>

            <ul>
              <li>
                Any online preview concerning your establishment is removed. The link stops working
                immediately and the document is deleted from storage.
              </li>
              <li>
                Your domain, and your email address if you provide one, are added to a permanent
                suppression list. The list does not store those values in plain text, only
                cryptographic fingerprints that allow us to recognise them if they reappear in a
                public source.
              </li>
              <li>
                All other outreach data about you is deleted immediately, without waiting for the
                normal 90-day retention period.
              </li>
            </ul>

            <p>
              The suppression list is checked before every contact and every preview publication.
              Its fingerprints are retained so that your opt-out remains effective over time, even
              if your contact details later reappear in a public source.
            </p>

            <p>
              If you also want to prevent OdysseusBot from accessing your site, you can block it
              directly in your robots.txt file without contacting us. The rule to add is shown on
              the{' '}
              <a className="underline" href="/bot">
                OdysseusBot
              </a>{' '}
              page. Details of the data we collect and how we use it are set out on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                outreach and personal data
              </a>{' '}
              page.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
