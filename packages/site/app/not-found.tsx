import type { Metadata } from 'next';
import { LanguageSection } from '../lib/language';

export const metadata: Metadata = {
  title: 'Page introuvable',
};

/** Bilingual 404 inside the shared frame, so an unknown URL stops serving
 *  Next's default English error page regardless of the visitor's chosen
 *  language. */
export default function NotFound() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <h1 className="title measure">Page introuvable</h1>
          <p className="lede measure mt-5">
            Erreur 404&#160;: la page demandée n&apos;existe pas ou n&apos;est plus disponible.
            Voici les pages du site.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/">
              Retour à la page d&apos;accueil
            </a>
            <a className="btn btn-secondary" href="/offre">
              L&apos;offre
            </a>
            <a className="btn btn-secondary" href="/bot">
              OdysseusBot
            </a>
          </div>
        </section>
      </LanguageSection>

      <LanguageSection lang="en">
        <section className="shell hero">
          <h1 className="title measure">Page not found</h1>
          <p className="lede measure mt-5">
            Error 404: the requested page does not exist or is no longer available. Here are the
            pages of the site.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/">
              Back to the homepage
            </a>
            <a className="btn btn-secondary" href="/offre">
              The offer
            </a>
            <a className="btn btn-secondary" href="/bot">
              OdysseusBot
            </a>
          </div>
        </section>
      </LanguageSection>
    </main>
  );
}
