import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Odysseusaudit.com',
  description: 'Odysseusaudit.com, site en construction',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
