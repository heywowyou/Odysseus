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
          <p className="label numeric">Erreur 404</p>
          <h1 className="title measure mt-4">Page introuvable</h1>
          <p className="lede measure mt-5">
            La page demandée n&apos;existe pas ou n&apos;est plus disponible. Voici les pages
            existantes.
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
          <p className="label numeric">Error 404</p>
          <h1 className="title measure mt-4">Page not found</h1>
          <p className="lede measure mt-5">
            The requested page does not exist or is no longer available. Here are the pages that do.
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
