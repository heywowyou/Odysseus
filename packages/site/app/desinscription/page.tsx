import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';
import { optOutStoreFromEnvironment } from '../../lib/opt-out';

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

/** Rendered per request: the prefill depends on the link token. */
export const dynamic = 'force-dynamic';

type Status = 'envoye' | 'invalide' | 'erreur';

const FORM_COPY = {
  fr: {
    label: 'Adresse e-mail',
    submit: 'Ne plus être contacté',
    envoye: 'Votre demande est enregistrée. Vous ne recevrez plus de message de notre part.',
    invalide: 'Cette adresse e-mail ne semble pas valide. Vérifiez-la et réessayez.',
    erreur:
      'Votre demande n’a pas pu être transmise. Réessayez, ou écrivez à contact@odysseusaudit.fr.',
  },
  en: {
    label: 'Email address',
    submit: 'Stop being contacted',
    envoye: 'Your request has been recorded. You will not hear from us again.',
    invalide: 'This email address does not look valid. Please check it and try again.',
    erreur: 'Your request could not be sent. Please try again, or email contact@odysseusaudit.fr.',
  },
} as const;

async function prefillFor(token: string | undefined): Promise<string> {
  if (token === undefined || token === '') return '';
  try {
    return (await optOutStoreFromEnvironment().addressForToken(token)) ?? '';
  } catch {
    return '';
  }
}

function OptOutForm({
  lang,
  address,
  token,
  status,
}: {
  lang: 'fr' | 'en';
  address: string;
  token: string | undefined;
  status: Status | undefined;
}) {
  const copy = FORM_COPY[lang];
  const inputId = `opt-out-email-${lang}`;
  return (
    <>
      {status !== undefined ? (
        <p role="status" className="font-semibold">
          {copy[status]}
        </p>
      ) : null}
      {status === 'envoye' ? null : (
        <form method="post" action="/desinscription/envoyer" className="not-prose grid gap-3">
          <label htmlFor={inputId} className="font-semibold">
            {copy.label}
          </label>
          <input
            id={inputId}
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={address}
            className="w-full max-w-md rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-[var(--ink)]"
          />
          {token !== undefined && token !== '' ? (
            <input type="hidden" name="t" value={token} />
          ) : null}
          <div aria-hidden="true" className="hidden">
            <input name="site" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <p>
            <button type="submit" className="btn btn-primary">
              {copy.submit}
            </button>
          </p>
        </form>
      )}
    </>
  );
}

export default async function OptOutPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; statut?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === 'string' ? params.t : undefined;
  const status = (['envoye', 'invalide', 'erreur'] as const).find(
    (value) => value === params.statut,
  );
  const address = await prefillFor(token);
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
              Indiquez l&apos;adresse e-mail à laquelle nous vous avons écrit. Si vous arrivez
              depuis notre message, elle est déjà remplie.
            </p>

            <OptOutForm lang="fr" address={address} token={token} status={status} />

            <p>
              Vous pouvez aussi{' '}
              <a className="underline" href={MAILTO_FR}>
                écrire à contact@odysseusaudit.fr
              </a>{' '}
              ou répondre simplement au message que vous avez reçu.
            </p>

            <h2>Ce qui se passe ensuite</h2>

            <p>
              Votre demande nous est transmise dès que vous cliquez et elle est traitée
              automatiquement dans la minute. Nous prenons alors les trois mesures suivantes.
            </p>

            <ul>
              <li>
                Tout aperçu en ligne concernant votre établissement est retiré. Le lien cesse
                immédiatement de fonctionner et le document est supprimé de son espace de stockage.
              </li>
              <li>
                Votre adresse e-mail, son domaine et celui de votre site sont inscrits sur une liste
                d&apos;opposition permanente. Elle ne conserve pas ces valeurs en clair, uniquement
                des empreintes cryptographiques qui permettent de les reconnaître si elles
                réapparaissent dans une source publique.
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
            <p>
              Enter the email address we wrote to. If you came from our message, it is already
              filled in.
            </p>

            <OptOutForm lang="en" address={address} token={token} status={status} />

            <p>
              You can also{' '}
              <a className="underline" href={MAILTO_EN}>
                email contact@odysseusaudit.fr
              </a>{' '}
              or simply reply to the message you received.
            </p>

            <h2>What happens next</h2>

            <p>
              Your request reaches us as soon as you click and is processed automatically within a
              minute. We then take the following three steps.
            </p>

            <ul>
              <li>
                Any online preview concerning your establishment is removed. The link stops working
                immediately and the document is deleted from storage.
              </li>
              <li>
                Your email address, its domain and your website&apos;s domain are added to a
                permanent suppression list. The list does not store those values in plain text, only
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
