/**
 * What the preview route answers, milestone 9c plan 009.
 *
 * Kept as a plain function returning a status, a body and headers, with the
 * route handler a shell around it. Three answers remain deliberate: 404 for
 * malformed, unknown or revoked tokens; 410 for expired previews; 200 for the
 * stored document unchanged.
 */

import { objectKeyForToken } from './preview-object';
import type { PreviewReader } from './read-preview';

export interface PreviewResponse {
  status: 200 | 404 | 410;
  body: string;
  headers: Record<string, string>;
}

const PREVIEW_FAILURE_STYLES = `
    body { margin: 0; background: #ffffff; color: #171717; font-family: system-ui, sans-serif; line-height: 1.6; }
    main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.5rem; }
    h1 { font-size: 1.5rem; line-height: 1.33; }
    p[lang="en"] { margin-top: 0.25rem; }
    hr { border: 0; border-top: 1px solid color-mix(in srgb, #171717 15%, transparent); margin: 2rem 0; }
    a { color: inherit; }
    @media (prefers-color-scheme: dark) {
      body { background: #0a0a0a; color: #ededed; }
      hr { border-top-color: color-mix(in srgb, #ededed 15%, transparent); }
    }`;

const PREVIEW_FAILURE_HELP = `
      <hr>
      <p>Si Odysseus vous a envoyé ce lien, répondez simplement au message reçu ou écrivez à <a href="mailto:contact@odysseusaudit.fr">contact@odysseusaudit.fr</a>.</p>
      <p lang="en">If Odysseus sent you this link, simply reply to the message you received or email <a href="mailto:contact@odysseusaudit.fr">contact@odysseusaudit.fr</a>.</p>
      <p><a href="/">Retour à l'accueil / Back to homepage</a></p>`;

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
  "Ce lien ne correspond à aucun aperçu disponible. Il est peut-être incomplet, ou l'aperçu a été retiré.",
  'This link does not match an available preview. It may be incomplete, or the preview may have been removed.',
);

const GONE_BODY = previewFailurePage(
  'Aperçu expiré',
  'Cet aperçu a expiré',
  "Les aperçus restent disponibles pendant 30 jours. Ce délai est maintenant écoulé et le lien n'est plus actif.",
  'Previews remain available for 30 days. That period has now ended and the link is no longer active.',
);

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
  if (stored.publicExpiresAt.getTime() <= now.getTime()) return refuse(410, GONE_BODY);

  return { status: 200, body: stored.html, headers: { ...PREVIEW_SECURITY_HEADERS } };
}
