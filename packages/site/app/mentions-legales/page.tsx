import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  "L'éditeur du site Odysseus, son numéro d'identification, le directeur de la publication et l'hébergeur.";

export const metadata: Metadata = {
  title: 'Mentions légales',
  description,
  alternates: { canonical: '/mentions-legales' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/mentions-legales',
    title: 'Mentions légales',
    description,
  },
};

/**
 * Publisher identification under article 1-1 of the LCEN and, for the
 * electronic-commerce activity, its article 19. Written 2026-09-28; the
 * checklist in docs/rules/operator-obligations.md section 8 tracks what is
 * still missing (the phone number LCEN article 1-1 asks for). Odysseus is an
 * unregistered brand: the establishment's only trade name is CULT OF AURORA,
 * so the publisher is named as the sole trader, never as "enseigne Odysseus".
 *
 * The address is the establishment address published in the Sirene register
 * (indice de répétition T, "ter"). The host details are Vercel's own, from its
 * privacy notice (postal address) and DMCA policy (phone), read 2026-09-28.
 */
export default function LegalNoticePage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading className="title measure" fr="Mentions légales" en="Legal notice" />
      </section>

      <LanguageSection lang="fr">
        <div className="shell section-tight">
          <section className="prose measure">
            <h2 id="editeur-ml">Éditeur du site</h2>

            <p>
              Jules Fontaine, entrepreneur individuel (EI), sous le régime de la micro-entreprise.
              <br />
              71 ter, allée du Haurat, 33470 Gujan-Mestras, France.
              <br />
              SIREN&#160;: 980&#160;766&#160;463. SIRET&#160;: 980&#160;766&#160;463&#160;00023.
              <br />
              Contact&#160;: contact@odysseusaudit.fr.
            </p>

            <p>TVA non applicable, l&apos;éditeur relevant de la franchise en base de TVA.</p>

            <h2 id="directeur-ml">Directeur de la publication</h2>

            <p>Jules Fontaine.</p>

            <h2 id="hebergeur-ml">Hébergeur</h2>

            <p>
              Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis.
              <br />
              Téléphone&#160;: +1 559 288 7060.
            </p>

            <h2 id="propriete-ml">Propriété intellectuelle</h2>

            <p>
              Les textes, le nom Odysseus et les éléments graphiques de ce site sont la propriété de
              leur éditeur. Toute reproduction substantielle sans autorisation écrite préalable est
              interdite.
            </p>

            <h2 id="donnees-ml">Données personnelles</h2>

            <p>
              Ce site ne dépose aucun cookie de mesure d&apos;audience ou de publicité. Les données
              utilisées pour la prospection sont décrites sur la page{' '}
              <a className="underline" href="/confidentialite-prospection">
                Prospection et données personnelles
              </a>
              , et celles des clients dans les{' '}
              <a className="underline" href="/cgv">
                conditions générales de vente
              </a>
              .
            </p>

            <p>
              Comme tout hébergeur, Vercel enregistre des journaux techniques des requêtes adressées
              à ce site, qui peuvent comporter l&apos;adresse IP et le navigateur du visiteur, et
              les conserve pendant une durée limitée, au plus 30 jours. Lorsque vous utilisez le
              formulaire de désinscription, votre adresse IP est en outre gardée en mémoire au plus
              dix minutes pour limiter les envois abusifs, puis oubliée. Ces traitements reposent
              sur notre intérêt légitime à assurer le fonctionnement et la sécurité du site. Vercel
              étant établi aux États-Unis, ces données peuvent y être transférées dans le cadre des
              garanties prévues par le règlement général sur la protection des données (RGPD).
            </p>

            <p>
              Le choix de langue est enregistré uniquement dans votre navigateur et n&apos;est
              transmis à personne. Pour exercer vos droits d&apos;accès, de rectification,
              d&apos;effacement, de limitation ou d&apos;opposition, écrivez à
              contact@odysseusaudit.fr. Vous pouvez également introduire une réclamation auprès de
              la CNIL.
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <div className="shell section-tight">
          <section className="prose measure">
            <h2 id="editeur-ml-en">Publisher</h2>

            <p>
              Jules Fontaine, sole trader (entrepreneur individuel, EI) under the French
              micro-enterprise scheme.
              <br />
              71 ter, allée du Haurat, 33470 Gujan-Mestras, France.
              <br />
              SIREN: 980 766 463. SIRET: 980 766 463 00023.
              <br />
              Contact: contact@odysseusaudit.fr.
            </p>

            <p>
              VAT not applicable: the publisher is covered by the French VAT exemption for small
              businesses.
            </p>

            <h2 id="directeur-ml-en">Publication director</h2>

            <p>Jules Fontaine.</p>

            <h2 id="hebergeur-ml-en">Host</h2>

            <p>
              Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, United States.
              <br />
              Phone: +1 559 288 7060.
            </p>

            <h2 id="propriete-ml-en">Intellectual property</h2>

            <p>
              The texts, the Odysseus name and the graphic elements of this site belong to their
              publisher. Substantial reproduction without prior written permission is prohibited.
            </p>

            <h2 id="donnees-ml-en">Personal data</h2>

            <p>
              This site sets no analytics or advertising cookies. The data used for outreach is
              described on the{' '}
              <a className="underline" href="/confidentialite-prospection">
                Outreach and personal data
              </a>{' '}
              page, and client data in the{' '}
              <a className="underline" href="/cgv">
                general terms of sale
              </a>
              .
            </p>

            <p>
              Like any host, Vercel keeps technical logs of requests made to this site, which may
              include the visitor&apos;s IP address and browser, for a limited period of at most 30
              days. When you use the opt-out form, your IP address is also held in memory for at
              most ten minutes to limit abusive submissions, then discarded. This processing is
              based on our legitimate interest in keeping the site running and secure. As Vercel is
              established in the United States, this data may be transferred there under the
              safeguards provided for by the General Data Protection Regulation (GDPR).
            </p>

            <p>
              Your language choice is stored only in your browser and is not sent to anyone. To
              exercise your rights of access, rectification, erasure, restriction or objection,
              email contact@odysseusaudit.fr. You may also lodge a complaint with the CNIL, the
              French data protection authority.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
