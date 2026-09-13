import type { Metadata } from 'next';
import { LanguageSection } from '../lib/language';

export const metadata: Metadata = {
  title: 'Page introuvable',
};

export default function NotFound() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <LanguageSection lang="fr">
        <section className="shell hero">
          <h1 className="title measure">Page introuvable</h1>
          <p className="lede measure mt-5">
            La page que vous cherchez n&apos;existe pas ou n&apos;est plus disponible. Vous pouvez
            revenir à l&apos;accueil ou consulter le diagnostic.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/">
              Retour à l&apos;accueil
            </a>
            <a className="btn btn-secondary" href="/offre">
              Le diagnostic
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
            The page you&apos;re looking for doesn&apos;t exist or is no longer available. You can
            return to the homepage or view the technical diagnostic.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/">
              Back to homepage
            </a>
            <a className="btn btn-secondary" href="/offre">
              The diagnostic
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
