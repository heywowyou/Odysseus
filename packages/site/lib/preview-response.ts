/**
 * What the preview route answers, milestone 9c plan 009.
 *
 * Kept as a plain function returning a status, a body and headers, with the
 * route handler a shell around it. That is not ceremony: `packages/site` has no
 * React testing setup and the workspace's Vitest configuration collects plain
 * `.ts` files in a Node environment, so this shape is what lets every status,
 * every header and the expiry boundary be tested at all without adding a test
 * dependency to a marketing site.
 *
 * Three answers, and the distinction between them is deliberate:
 *
 * - **404** for a malformed token, an unknown one, and a revoked one alike.
 *   Telling them apart would confirm to somebody guessing that a token was well
 *   formed, and would tell anyone holding a withdrawn link that it once worked.
 * - **410** for a preview that existed and has passed its public lifetime. The
 *   recipient was promised thirty days; "this expired" is a true and useful
 *   answer, and it is the one case where saying more than "no" is right.
 * - **200** with the stored document byte for byte. It is already validated and
 *   linted by the time it reaches the bucket; nothing here rewrites it.
 */

import { objectKeyForToken } from './preview-object';
import type { PreviewReader } from './read-preview';

export interface PreviewResponse {
  status: 200 | 404 | 410;
  body: string;
  headers: Record<string, string>;
}

/**
 * The failure pages, rewritten as small complete documents by plan 022 step 7.
 * The bare one-line strings they replace told the truth but gave a 404/410
 * recipient nothing to do next. The route contract itself is untouched: same
 * statuses, same headers, same 200 passthrough, and the 404 body stays one
 * shared constant so malformed, unknown and revoked remain indistinguishable.
 * The CSP below allows inline styles only, so these pages carry no external
 * resources of any kind.
 *
 * French first with the English text beneath, as on the compliance pages; the
 * thirty-day public lifetime is the one promised in docs/rules/outreach-rules.md
 * and stated on /confidentialite-prospection.
 */

const PREVIEW_FAILURE_STYLES = `
    body { margin: 0; background: #ffffff; color: #171717; font-family: Arial, Helvetica, sans-serif; line-height: 1.6; }
    main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem; }
    h1 { font-size: 1.5rem; line-height: 1.33; }
    p[lang="en"] { margin-top: 0.25rem; }
    hr { border: 0; border-top: 1px solid #e5e5e5; margin: 2rem 0; }
    a { color: inherit; }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0a; color: #ededed; }
      hr { border-top-color: #262626; }
    }`;

const PREVIEW_FAILURE_HELP = `
      <hr>
      <p>Si ce lien vous a été envoyé par Odysseus et ne fonctionne plus, répondez simplement au message reçu, ou écrivez à <a href="mailto:contact@odysseusaudit.com">contact@odysseusaudit.com</a>.</p>
      <p lang="en">If Odysseus sent you this link and it no longer works, simply reply to the message you received, or write to <a href="mailto:contact@odysseusaudit.com">contact@odysseusaudit.com</a>.</p>
      <p><a href="/">Retour à la page d'accueil / Back to the home page</a></p>`;

function previewFailurePage(title: string, heading: string, french: string, english: string) {
  return (
    `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${title}</title>\n<style>${PREVIEW_FAILURE_STYLES}</style>\n</head>\n<body>\n<main>\n` +
    `<h1>${heading}</h1>\n<p>${french}</p>\n<p lang="en">${english}</p>\n` +
    `${PREVIEW_FAILURE_HELP}\n</main>\n</body>\n</html>`
  );
}

const NOT_FOUND_BODY = previewFailurePage(
  'Aperçu indisponible',
  "Cet aperçu n'est pas disponible",
  'Le lien ouvert ne correspond à aucun aperçu publié. Il est peut-être incomplet, ou le document a été retiré.',
  'The link you opened does not match any published preview. It may be incomplete, or the document has been withdrawn.',
);

const GONE_BODY = previewFailurePage(
  'Aperçu expiré',
  'Cet aperçu a expiré',
  "Les aperçus publiés en ligne restent accessibles trente jours. Passé ce délai, le lien cesse de fonctionner et le document est supprimé de l'espace de stockage.",
  'Published previews stay reachable for thirty days. After that, the link stops working and the document is deleted from its storage.',
);

/**
 * Security headers for a document that is a self-contained page of inline CSS
 * and data-URI PNGs with no script of any kind - which is what plan 008
 * produces, so this policy is a description of the document rather than a
 * restriction imposed on it.
 *
 * `style-src 'unsafe-inline'` is required because the stylesheet is inlined;
 * with `default-src 'none'` and no script source at all, it grants nothing an
 * attacker could use. `no-store` because a preview must not outlive its own
 * expiry in a shared cache, and `no-referrer` because the URL *is* the
 * credential and must not travel to any site the reader clicks through to.
 */
export const PREVIEW_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/html; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'cache-control': 'private, no-store, max-age=0, must-revalidate',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; " +
    "form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
};

function refuse(status: 404 | 410, body: string): PreviewResponse {
  return { status, body, headers: { ...PREVIEW_SECURITY_HEADERS } };
}

export async function resolvePreviewResponse(options: {
  token: string;
  reader: PreviewReader;
  now?: Date;
}): Promise<PreviewResponse> {
  const objectKey = objectKeyForToken(options.token);
  if (objectKey === null) return refuse(404, NOT_FOUND_BODY);

  const stored = await options.reader.read(objectKey);
  if (stored === null) return refuse(404, NOT_FOUND_BODY);

  const now = options.now ?? new Date();
  // Inclusive: at the instant it expires, it is expired.
  if (stored.publicExpiresAt.getTime() <= now.getTime()) return refuse(410, GONE_BODY);

  return { status: 200, body: stored.html, headers: { ...PREVIEW_SECURITY_HEADERS } };
}
