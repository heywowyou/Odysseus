import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';

const description =
  "La démarche d'accessibilité de ce site, ce qui a été vérifié, ce qui ne l'a pas encore été, et comment signaler un problème.";

export const metadata: Metadata = {
  title: "Démarche d'accessibilité",
  description,
  alternates: { canonical: '/accessibilite' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/accessibilite',
    title: "Démarche d'accessibilité",
    description,
  },
};

/**
 * Issue #213 item 2: the self-audit found no accessibility statement.
 * Odysseus sells accessibility diagnostics, so it should hold its own site
 * to the same standard - but this page deliberately does not claim RGAA/
 * Article 47 conformity, since that requires a full applicable audit that
 * has not been carried out on this site. It states what has actually been
 * done and how to report a problem, matching the wording discipline already
 * used for the commercial pages (see lib/marketing-copy.test.ts's
 * APPROVED_LIMIT wording).
 */
export default function AccessibilityPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <section className="shell hero pb-0">
        <PageHeading
          className="title measure"
          fr="Démarche d'accessibilité"
          en="Accessibility approach"
        />
      </section>
      <LanguageSection lang="fr">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            Ce que nous avons vérifié sur ce site, ce qui ne l&apos;a pas encore été, et comment
            signaler un problème.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <h2 id="statut-a11y">Statut</h2>
            <p>
              Ce site n&apos;a pas fait l&apos;objet d&apos;un audit RGAA complet et ne fait donc
              aucune déclaration de conformité au titre de l&apos;article 47 de la loi du 11 février
              2005. Cette page décrit une démarche, pas une certification.
            </p>

            <h2 id="demarche-a11y">Ce qui a été fait</h2>
            <ul>
              <li>
                Une seule rubrique de niveau 1 par page, suivie d&apos;une hiérarchie de sous-titres
                cohérente.
              </li>
              <li>Un lien d&apos;évitement vers le contenu principal, en début de page.</li>
              <li>
                Le contenu bilingue est entièrement présent dans le HTML initial&#160;: la langue
                inactive est masquée avec l&apos;attribut natif <code>hidden</code>, pas retirée du
                DOM ni chargée après coup, afin de rester utilisable sans JavaScript.
              </li>
              <li>
                Les contrôles automatisés d&apos;accessibilité (axe-core) que ce site utilise
                lui-même pour ses diagnostics sont exécutés sur ses propres pages avant publication.
              </li>
            </ul>

            <h2 id="limites-a11y">Ce qui reste à vérifier</h2>
            <p>
              Les contrôles automatisés ne couvrent qu&apos;une partie des critères RGAA&#160;: la
              navigation complète au clavier, l&apos;usage avec un lecteur d&apos;écran et le
              contraste de chaque composant n&apos;ont pas fait l&apos;objet d&apos;une revue
              manuelle exhaustive.
            </p>

            <h2 id="contact-a11y">Signaler un problème</h2>
            <p>
              Si une page de ce site vous pose une difficulté d&apos;accessibilité, écrivez-nous à{' '}
              <a className="underline" href="mailto:contact@odysseusaudit.fr">
                contact@odysseusaudit.fr
              </a>{' '}
              en précisant la page et le problème rencontré&#160;: nous vous répondrons
              personnellement.
            </p>
          </section>
        </div>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero pt-0">
          <p className="lede measure mt-5">
            What we have checked on this site, what has not been checked yet, and how to report a
            problem.
          </p>
        </section>

        <div className="shell section-tight">
          <section className="prose measure">
            <h2 id="statut-a11y-en">Status</h2>
            <p>
              This site has not undergone a full RGAA audit and therefore makes no conformity
              declaration under Article 47 of the French law of 11 February 2005. This page
              describes an approach, not a certification.
            </p>

            <h2 id="demarche-a11y-en">What has been done</h2>
            <ul>
              <li>
                A single level-1 heading per page, followed by a consistent subheading hierarchy.
              </li>
              <li>A skip link to the main content, at the top of the page.</li>
              <li>
                Bilingual content is fully present in the initial HTML: the inactive language is
                hidden with the native <code>hidden</code> attribute, not removed from the DOM or
                loaded afterwards, so the page keeps working without JavaScript.
              </li>
              <li>
                The automated accessibility checks (axe-core) this site itself uses for its
                diagnostics are run on its own pages before publication.
              </li>
            </ul>

            <h2 id="limites-a11y-en">What remains to be checked</h2>
            <p>
              Automated checks only cover part of the RGAA criteria: full keyboard navigation,
              screen-reader use and the contrast of every component have not been through an
              exhaustive manual review.
            </p>

            <h2 id="contact-a11y-en">Report a problem</h2>
            <p>
              If a page on this site is causing you an accessibility difficulty, write to us at{' '}
              <a className="underline" href="mailto:contact@odysseusaudit.fr">
                contact@odysseusaudit.fr
              </a>{' '}
              with the page and the problem you encountered: we will reply to you personally.
            </p>
          </section>
        </div>
      </LanguageSection>
    </main>
  );
}
