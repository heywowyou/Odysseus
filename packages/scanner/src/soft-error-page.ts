/**
 * Issue #302: a page that answers 200 while telling the visitor the page
 * does not exist. A real audit listed `/erreur-404`, `/en/erreur-404`,
 * `/es/erreur-404` and `/it/erreur-404` among its 140 analysed pages;
 * they took up scope, carried findings, and inflated every per-page
 * denominator in the report with four copies of one error template.
 *
 * Decided post-hoc in write-audit.ts, the same way issue #85's redirect
 * interstitial is: the page has already been scanned by the time its title
 * is known, and like that status it stays inventoried and disclosed while
 * never joining the content-checked population.
 *
 * Explicit matches rather than a similarity score, and a title alone is
 * not enough when the page's first heading names other content (plan 075
 * K4):
 *
 *  - the URL's own last path segment is an error slug. Whole-segment only,
 *    so a genuine article at /blog/comment-eviter-les-erreurs-404 is not
 *    caught by a substring.
 *  - the page's first h1, or its title together with its first heading,
 *    announces the error. Sites write this in their own language, so the
 *    patterns cover the languages this tool sells in plus the bare code,
 *    and they must match at the start of the string: a page titled "404"
 *    is an error page, one titled "Nos chambres | Erreur 404 possible" is
 *    not a shape any CMS emits.
 */
import { announcesMissingPage } from '@odysseus/core';

const ERROR_SLUGS = new Set([
  '404',
  '404.html',
  '404.php',
  'erreur-404',
  'erreur404',
  'error-404',
  'error404',
  'page-not-found',
  'not-found',
  'page-introuvable',
  'pagina-no-encontrada',
  'pagina-non-trovata',
]);

export interface SoftErrorPageInput {
  url: string;
  title: string | null | undefined;
  /** The page's headings, in document order. Only the first h1 is read. */
  headings: readonly { level: number; text: string }[] | undefined;
}

function lastPathSegment(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter((segment) => segment !== '');
    return (segments.at(-1) ?? '').toLowerCase();
  } catch {
    return '';
  }
}

export function isSoftErrorPage(page: SoftErrorPageInput): boolean {
  if (ERROR_SLUGS.has(lastPathSegment(page.url))) return true;
  const firstH1 = page.headings?.find((heading) => heading.level === 1);
  if (firstH1 !== undefined && announcesMissingPage(firstH1.text)) return true;
  if (!announcesMissingPage(page.title)) return false;
  // Plan 075 K4 and L1: an error title alone never makes an error page;
  // the page's first heading has to announce the error too. aflatta's shop
  // template titles every offer, gift voucher and its cart « Page
  // introuvable »: the offers lead with a content heading, while the
  // vouchers (« Bon 100€ … OFFRIR ») and the cart have no heading at all.
  // Every true error page on the stored audits has an error slug or an
  // error heading.
  const firstHeading = page.headings?.[0];
  return firstHeading !== undefined && announcesMissingPage(firstHeading.text);
}
