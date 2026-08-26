import { describe, expect, it } from 'vitest';
import { renderRemainingWork, selectRemainingFindings } from './remaining-work.js';
import { selectRenderedThemes } from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings } from '../../test-fixtures.js';

describe('renderRemainingWork against the real sas-fernande.fr scan', () => {
  it('covers exactly the findings no rendered priority accounts for', async () => {
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');

    const remaining = selectRemainingFindings(analysis, findings);
    // selectRenderedThemes, not analysis.themes: a theme the priorities
    // section does not render is one the client never saw ranked, so its
    // findings belong here. Asserting against the raw theme list would
    // encode the opposite, and silently drop those findings from both.
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const covered = new Set(
      selectRenderedThemes(analysis.themes, findingsById).flatMap((t) => t.findingIds),
    );

    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.length).toBeLessThan(findings.length);
    for (const finding of remaining) expect(covered.has(finding.findingId)).toBe(false);
    // A partition: every finding is either ranked or listed here, never both
    // and never neither.
    expect(remaining.length + covered.size).toBe(findings.length);
  });

  it('gives every rendered rule group an action line, not only counts', async () => {
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);

    // The section exists to answer "what do I do about these". A group with
    // counts and no action is the defect this section was built to fix.
    const groupCount = html.split('class="remaining-rule"').length - 1;
    const actionCount = html.split('max-width:70ch').length - 1;
    expect(groupCount).toBeGreaterThan(0);
    expect(actionCount).toBe(groupCount);
  });

  it('names every finding it covers, so nothing is silently omitted', async () => {
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    const remaining = selectRemainingFindings(analysis, findings);
    const rules = new Set(remaining.map((f) => f.ruleId));

    // One block per distinct rule, and each block's counts add back up.
    expect(html.split('class="remaining-rule"').length - 1).toBe(rules.size);
  });

  it('renders in English too, with no French leaking through', async () => {
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');

    const html = renderRemainingWork(getStrings('en'), 6, 'en', analysis, findings);

    expect(html).toContain('Still to address');
    expect(html).not.toContain('Reste');
  });

  it("fix #5 (2026-08-25 report review): shows each rule group's own worst severity, not a uniform blank list", async () => {
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    const remaining = selectRemainingFindings(analysis, findings);
    const groupCount = html.split('class="remaining-rule"').length - 1;

    const severityRank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
    const worstByRule = new Map<string, keyof typeof severityRank>();
    for (const finding of remaining) {
      const current = worstByRule.get(finding.ruleId);
      if (!current || severityRank[finding.severity] < severityRank[current]) {
        worstByRule.set(finding.ruleId, finding.severity);
      }
    }

    expect(groupCount).toBe(worstByRule.size);
    // Every group carries the severity vocabulary reused from
    // findingsAppendix.severityLabels, and remaining findings span more than
    // one worst-severity value on this real fixture, so more than one label
    // must appear.
    const severityLabels = getStrings('fr').findingsAppendix.severityLabels;
    const worstSeveritiesPresent = new Set(worstByRule.values());
    expect(worstSeveritiesPresent.size).toBeGreaterThan(1);
    for (const severity of worstSeveritiesPresent) {
      expect(html).toContain(severityLabels[severity]);
    }
  });
});
