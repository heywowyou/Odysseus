import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { renderCoreWebVitalsTable } from './core-web-vitals-table.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderCoreWebVitalsTable', () => {
  it('renders the "not measured" fallback for the sas-fernande.fr capture, which predates coreWebVitals', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderCoreWebVitalsTable(getStrings('en'), manifest);

    expect(html).toContain('Not measured');
    expect(html).not.toContain('undefined');
  });

  it('renders real LCP/CLS/TBT display values when coreWebVitals is present', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/',
          pageDir: 'pages/root-aaa',
          depth: 0,
          status: 'visited',
          errors: {},
          coreWebVitals: {
            lcp: { score: 0.9, numericValue: 1800, displayValue: '1.8 s' },
            cls: { score: 1, numericValue: 0, displayValue: '0' },
            tbt: { score: 0.8, numericValue: 120, displayValue: '120 ms' },
          },
        },
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), manifest);
    expect(html).toContain('1.8 s');
    expect(html).toContain('120 ms');
  });

  it('renders nothing when no page has a pageDir', () => {
    const manifest = { pages: [{ url: 'x', depth: 0, status: 'error', errors: {} }] } as unknown as AuditManifest;
    expect(renderCoreWebVitalsTable(getStrings('en'), manifest)).toBe('');
  });
});
