import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

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
    'Diagnostic technique automatisé pour sites web : accessibilité, référencement technique et performance. Rapport en français et en anglais, prix publié de 1 600 € HT.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/',
    title: 'Odysseus, diagnostic technique de site web',
    description:
      'Diagnostic technique automatisé pour sites web : accessibilité, référencement technique et performance. Rapport en français et en anglais, prix publié de 1 600 € HT.',
  },
  twitter: { card: 'summary' },
};

function SiteHeader() {
  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
        <a className="font-semibold tracking-tight" href="/">
          Odysseus
        </a>
        <nav
          aria-label="Navigation principale"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        >
          <a className="hover:underline" href="/">
            Accueil
          </a>
          <a className="hover:underline" href="/offre">
            L&apos;offre
          </a>
          <a className="hover:underline" href="/bot">
            OdysseusBot
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm">
        <p className="font-semibold tracking-tight">Odysseus</p>
        <a className="hover:underline" href="mailto:contact@odysseusaudit.com">
          contact@odysseusaudit.com
        </a>
        <nav aria-label="Pages légales" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a className="hover:underline" href="/confidentialite-prospection">
            Prospection et données personnelles
          </a>
          <a className="hover:underline" href="/desinscription">
            Désinscription
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className={`h-full ${inter.variable}`}>
      <body className="flex min-h-full flex-col">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-background focus:px-3 focus:py-2 focus:underline"
          href="#contenu"
        >
          Aller au contenu
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
