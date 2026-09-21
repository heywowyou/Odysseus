import type { Metadata } from 'next';
import { LanguageSection, PageHeading } from '../../lib/language';
import { ReportViewer } from '../../lib/report-viewer';

/**
 * The permanent example report, readable one A4 page at a time.
 *
 * Plan 071 first served the approved PDF itself at this address, noindex,
 * for outreach links only. The page now wraps that same approved PDF (moved
 * to /exemple-audit.pdf, still noindex) in an indexable page, so a visitor
 * arriving from search can read a real deliverable without downloading or
 * scrolling a long document. The PDF remains the only published artifact:
 * nothing here restates findings, and the introduction only describes what
 * the example is.
 */

const PDF_PATH = '/exemple-audit.pdf';

const description =
  "Un rapport de diagnostic Odysseus complet, à lire page par page : constats, preuves, priorités et préconisations, à partir d'un audit réel anonymisé.";

export const metadata: Metadata = {
  title: 'Exemple de rapport de diagnostic',
  description,
  alternates: { canonical: '/exemple-audit' },
  openGraph: {
    type: 'website',
    siteName: 'Odysseus',
    locale: 'fr_FR',
    url: '/exemple-audit',
    title: 'Exemple de rapport de diagnostic',
    description,
  },
};

export default function ExampleReportPage() {
  return (
    <main id="contenu" tabIndex={-1} className="flex-1">
      <div className="shell hero example-layout">
        <div className="example-intro">
          <PageHeading className="heading" fr="Exemple de rapport" en="Example report" />

          <LanguageSection lang="fr">
            <p className="soft mt-4">
              Un rapport complet, tel que nous le remettons à nos clients. Parcourez-le page par
              page avec les flèches, ou allez directement à une section.
            </p>
            <div className="statement mt-6">
              <p className="label">À propos de cet exemple</p>
              <p className="small mt-2">
                L&apos;identité de l&apos;établissement, son site et ses données administratives
                ont été remplacés. Les constats et mesures proviennent d&apos;un audit anonymisé et
                servent uniquement à illustrer le livrable&#160;; ils ne décrivent pas
                l&apos;établissement fictif présenté ici.
              </p>
            </div>
            <ul className="small mt-6 space-y-2">
              <li>
                <a className="evidence-link" href={PDF_PATH}>
                  Télécharger le rapport en PDF
                </a>
              </li>
              <li>
                <a className="evidence-link" href="/offre">
                  Le diagnostic, ses contrôles et son tarif
                </a>
              </li>
            </ul>
          </LanguageSection>

          <LanguageSection lang="en">
            <p className="soft mt-4">
              A complete report, as we deliver it to our clients. Read it page by page with the
              arrows, or go straight to a section. The example is in French; commissioned reports
              are delivered in French or English.
            </p>
            <div className="statement mt-6">
              <p className="label">About this example</p>
              <p className="small mt-2">
                The business&apos;s identity, website and administrative details have been
                replaced. The findings and measurements come from an anonymised audit and only
                illustrate the deliverable; they do not describe the fictional business shown here.
              </p>
            </div>
            <ul className="small mt-6 space-y-2">
              <li>
                <a className="evidence-link" href={PDF_PATH}>
                  Download the report as a PDF
                </a>
              </li>
              <li>
                <a className="evidence-link" href="/offre">
                  The diagnostic, its checks and its price
                </a>
              </li>
            </ul>
          </LanguageSection>
        </div>

        <ReportViewer src={PDF_PATH} />
      </div>
    </main>
  );
}
