import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page introuvable',
};

/** Plain French 404 inside the shared frame, so an unknown URL stops serving
 * Next's default English error page to a French audience. */
export default function NotFound() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto max-w-2xl flex-1 px-6 py-12">
      <h1 className="mb-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mb-4">L&apos;adresse demandée n&apos;existe pas ou plus.</p>
      <p>
        <a className="underline" href="/">
          Retour à la page d&apos;accueil
        </a>
      </p>
    </main>
  );
}
