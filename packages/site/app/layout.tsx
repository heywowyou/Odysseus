import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SiteChrome } from '../lib/site-chrome';
import { StructuredData } from '../lib/structured-data';

/**
 * Avenir Next, self-hosted, site-only (operator-licensed 2026-09-11; see
 * PRODUCT.md, Evidence on Hand). The report and dashboard keep the locked
 * Inter system untouched (docs/report/report-design-system.md); this
 * package deliberately imports nothing from the workspace, so its own copy
 * lives in app/fonts. next/font/local is part of Next itself, so no
 * dependency is added.
 */
const avenirNext = localFont({
  src: [
    { path: './fonts/AvenirNextCyr-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/AvenirNextCyr-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/AvenirNextCyr-Demi.woff2', weight: '600', style: 'normal' },
    { path: './fonts/AvenirNextCyr-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-avenir',
});

/**
 * No og:image anywhere on purpose: no image asset exists in this repository
 * (PRODUCT.md, Evidence on Hand) and none may be fabricated. The twitter
 * card is `summary`, the variant that renders correctly without an image.
 */
// Issue #213 item 5: trimmed from 198 to 157 characters so search
// engines are much less likely to truncate it mid-sentence, while keeping
// the approved "signaux techniques liés aux assistants IA" and "tarif
// fixe" wording (see lib/marketing-copy.test.ts).
const description =
  'Diagnostic technique avec préconisations : accessibilité, référencement, rendu JavaScript, performance, signaux techniques liés aux assistants IA, tarif fixe 990 € HT.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.odysseusaudit.com'),
  title: {
    default: 'Odysseus, diagnostic technique avec préconisations',
    template: '%s | Odysseus',
  },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/',
    title: 'Odysseus, diagnostic technique avec préconisations',
    description,
  },
  twitter: { card: 'summary' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`h-full ${avenirNext.variable}`}>
      <body className="flex min-h-full flex-col">
        <StructuredData />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
