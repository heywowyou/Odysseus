import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { renderScreeningFindings } from './screening-findings.js';
import { getStrings } from '../strings/i18n.js';

const BASE: Omit<Finding, 'findingId' | 'ruleId' | 'severity' | 'title' | 'occurrences' | 'pageUrls'> = {
  auditId: 'a1',
  schemaVersion: 1,
  source: 'axe',
  category: 'accessibility',
  wcagCriteria: [],
  description: 'desc',
  elements: [],
  rawEvidence: {},
  dedupeKey: 'd',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
};

function finding(overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'severity' | 'title'>): Finding {
  return {
    ...BASE,
    occurrences: 1,
    pageUrls: ['https://example.com/'],
    ...overrides,
  };
}

describe('renderScreeningFindings', () => {
  it('includes critical and serious findings by name, but not moderate or minor', () => {
    const findings: Finding[] = [
      finding({ findingId: 'f1', ruleId: 'color-contrast', severity: 'serious', title: 'Insufficient color contrast' }),
      finding({ findingId: 'f2', ruleId: 'image-alt', severity: 'critical', title: 'Image has no alt text' }),
      finding({ findingId: 'f3', ruleId: 'layout-shifts', severity: 'moderate', title: 'Layout shifts' }),
      finding({ findingId: 'f4', ruleId: 'modern-image-formats', severity: 'minor', title: 'Old image format' }),
    ];

    const html = renderScreeningFindings(getStrings('en'), 'en', findings);

    expect(html).toContain('Insufficient color contrast');
    expect(html).toContain('Image has no alt text');
    expect(html).not.toContain('Layout shifts');
    expect(html).not.toContain('Old image format');
  });

  it('never shows a page or selector, only rule-level counts', () => {
    const findings: Finding[] = [
      finding({
        findingId: 'f1',
        ruleId: 'color-contrast',
        severity: 'serious',
        title: 'Insufficient color contrast',
        occurrences: 12,
        pageUrls: ['https://example.com/a', 'https://example.com/b'],
        elements: [{ pageUrl: 'https://example.com/a', selector: '#header .cta-button', snippet: '' }],
      }),
    ];

    const html = renderScreeningFindings(getStrings('en'), 'en', findings);

    expect(html).not.toContain('#header .cta-button');
    expect(html).not.toContain('https://example.com/a');
    expect(html).toContain('12');
  });

  it('excludes the 5 extended accessibility pass rule IDs from the top-findings list even when critical', () => {
    const findings: Finding[] = [
      finding({ findingId: 'f1', ruleId: 'keyboard-trap', severity: 'critical', title: 'Keyboard focus is trapped' }),
    ];

    const html = renderScreeningFindings(getStrings('en'), 'en', findings);
    const topSection = html.split('Extended accessibility pass')[0] ?? '';

    expect(topSection).not.toContain('Keyboard focus is trapped');
  });

  it('shows the extended accessibility pass rule IDs as a count only, in the site language', () => {
    const findings: Finding[] = [
      finding({ findingId: 'f1', ruleId: 'keyboard-trap', severity: 'critical', title: 'Keyboard focus is trapped', occurrences: 3 }),
      finding({
        findingId: 'f2',
        ruleId: 'form-error-not-associated',
        severity: 'serious',
        title: 'Form error not exposed',
        occurrences: 2,
      }),
    ];

    const htmlEn = renderScreeningFindings(getStrings('en'), 'en', findings);
    expect(htmlEn).toContain('3 keyboard traps detected across the site');
    expect(htmlEn).toContain('2 forms with inaccessible error handling detected across the site');

    const htmlFr = renderScreeningFindings(getStrings('fr'), 'fr', findings);
    expect(htmlFr).toContain('pièges au clavier');
    expect(htmlFr).not.toContain('undefined');
  });

  it('renders the none-found note when no critical or serious findings exist', () => {
    const findings: Finding[] = [
      finding({ findingId: 'f1', ruleId: 'layout-shifts', severity: 'moderate', title: 'Layout shifts' }),
    ];

    const html = renderScreeningFindings(getStrings('en'), 'en', findings);
    expect(html).toContain('No critical or serious findings were detected');
  });

  it('renders the extended-pass none-found note when none of the 5 rule IDs are present', () => {
    const html = renderScreeningFindings(getStrings('en'), 'en', []);
    expect(html).toContain('No extended accessibility pass issues were detected');
  });

  it('escapes an injected finding title', () => {
    const findings: Finding[] = [
      finding({
        findingId: 'f1',
        ruleId: 'color-contrast',
        severity: 'critical',
        title: '<img src=x onerror=alert(1)>',
      }),
    ];

    const html = renderScreeningFindings(getStrings('en'), 'en', findings);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });
});
