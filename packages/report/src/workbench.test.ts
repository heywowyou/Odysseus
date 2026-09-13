import { describe, expect, it } from 'vitest';
import { renderReportWorkbenchHtml } from './workbench.js';

describe('renderReportWorkbenchHtml', () => {
  it('renders one selectable image per real PDF page', () => {
    const html = renderReportWorkbenchHtml({
      title: 'Rapport test',
      pdfPath: './report.pdf',
      pages: [
        { number: 1, imagePath: './pages/page-01.png' },
        { number: 2, imagePath: './pages/page-02.png' },
      ],
    });

    expect(html).toContain('id="pdf-page-1"');
    expect(html).toContain('data-pdf-page="2"');
    expect(html).toContain('Pixels du PDF réel · 2 pages');
    expect(html).toContain('href="./report.pdf"');
  });

  it('escapes display values before writing the workbench document', () => {
    const html = renderReportWorkbenchHtml({
      title: '<unsafe & title>',
      pdfPath: './report.pdf?x=1&y=2',
      pages: [{ number: 1, imagePath: './page.png?x=1&y=2' }],
    });

    expect(html).not.toContain('<unsafe & title>');
    expect(html).toContain('&lt;unsafe &amp; title&gt;');
    expect(html).toContain('./report.pdf?x=1&amp;y=2');
    expect(html).toContain('./page.png?x=1&amp;y=2');
  });
});
