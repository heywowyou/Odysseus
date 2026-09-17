/**
 * llms.txt, issue #213 item 8. An emerging, optional convention (not a
 * Next.js built-in metadata route like robots.ts/sitemap.ts) for giving AI
 * assistants a short, factual summary of a site plus links to its
 * canonical pages. No `public/` directory exists in this package, so this
 * is a route handler rather than a static file, mirroring app/robots.ts's
 * plain-text-response pattern.
 *
 * Content is limited to what is already published elsewhere on this site;
 * nothing here should say anything the rest of the site does not already
 * say.
 */

const BASE_URL = 'https://www.odysseusaudit.com';

const CONTENT = `# Odysseus

> Diagnostic technique de site web pour petites et moyennes entreprises françaises : accessibilité, référencement, rendu JavaScript, performance et signaux techniques liés aux assistants IA. Tarif fixe 990 € HT.

Odysseus analyse un site avec des outils de mesure automatisés (crawl, comparaison HTML initial / rendu JavaScript, axe-core, Lighthouse) et produit un rapport priorisé. Ce n'est pas un audit RGAA et le rapport ne se prononce pas sur les obligations juridiques du client.

## Pages

- [Accueil](${BASE_URL}/): présentation du diagnostic
- [Le diagnostic](${BASE_URL}/offre): contrôles réalisés, contenu du rapport, délai et tarif
- [OdysseusBot](${BASE_URL}/bot): comportement du robot d'indexation, identification, rythme des requêtes, conservation des données
- [Prospection et données personnelles](${BASE_URL}/confidentialite-prospection): origine des données utilisées pour la prospection commerciale et droits associés
- [Ne plus être contacté](${BASE_URL}/desinscription): opposition à la prospection
- [Démarche d'accessibilité](${BASE_URL}/accessibilite): ce qui a été vérifié sur ce site et comment signaler un problème

## Crawling

OdysseusBot s'identifie par l'en-tête User-Agent \`OdysseusBot/1.0\` et respecte robots.txt. Le détail de son comportement est publié sur la page OdysseusBot ci-dessus.
`;

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(CONTENT, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
