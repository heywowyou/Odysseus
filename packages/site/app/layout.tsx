import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SiteChrome } from '../lib/site-chrome';

/**
 * Inter, self-hosted. These are the four canonical woff2 files also used by
 * the report and the dashboard (PRODUCT.md, Evidence on Hand); they are copied
 * into app/fonts because this package deliberately imports nothing from the
 * workspace. next/font/local is part of Next itself, so no dependency is added.
 */
const inter = localFont({
  src: [
    { path: './fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Inter-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Inter-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * No og:image anywhere on purpose: no image asset exists in this repository
 * (PRODUCT.md, Evidence on Hand) and none may be fabricated. A follow-up can
 * add one when a real asset exists. The twitter card is `summary`, the variant
 * that renders correctly without an image.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://odysseusaudit.com'),
  title: {
    default: 'Odysseus, diagnostic technique de site web',
    template: '%s | Odysseus',
  },
  description:
    'Diagnostic technique automatisé pour sites web : accessibilité, référencement naturel, signaux de visibilité IA et performance. Rapport en français et en anglais, prix publié de 1 600 € HT.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/',
    title: 'Odysseus, diagnostic technique de site web',
    description:
      'Diagnostic technique automatisé pour sites web : accessibilité, référencement naturel, signaux de visibilité IA et performance. Rapport en français et en anglais, prix publié de 1 600 € HT.',
  },
  twitter: { card: 'summary' },
};

/**
 * Header, footer and skip link live in `../lib/site-chrome.tsx`: they need
 * the language toggle's `useLanguage()`, which forces them into a client
 * component, while this file must stay a server component to export
 * `metadata`. See that file's docblock for the split.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`h-full ${inter.variable}`}>
      <body className="flex min-h-full flex-col">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
