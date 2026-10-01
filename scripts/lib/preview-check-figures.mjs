/**
 * The figure half of the audit-finalizer's preview quick check (Q3): what
 * the outreach preview should print, computed from the audit's own data, and
 * the printed figures that disagree with it.
 *
 * The preview counts the report's primary population (core's
 * reportPopulation), so `primaryFindings` is that population, not the whole
 * findings.json. The printed text is `pdftotext -layout` of preview.pdf.
 */

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'];

/** The figures the preview prints, in its own order. */
export function expectedPreviewFigures({ coverageSummary, primaryFindings }) {
  const severity = Object.fromEntries(SEVERITIES.map((key) => [key, 0]));
  const categories = {};
  const pages = new Set();
  for (const finding of primaryFindings) {
    severity[finding.severity] += 1;
    categories[finding.category] = (categories[finding.category] ?? 0) + 1;
    for (const url of finding.pageUrls ?? []) pages.add(url);
  }
  return {
    inventoried: coverageSummary?.inventoriedUrlCount ?? null,
    // A page whose content checks partly ran still counts, as in core's
    // outreach-preview-summary and the report's statistics.
    contentChecked:
      coverageSummary?.content === undefined
        ? null
        : coverageSummary.content.completed + coverageSummary.content.partial,
    performanceMeasured: coverageSummary?.passes?.lighthouse?.completed ?? null,
    findings: primaryFindings.length,
    affectedPages: pages.size,
    severity,
    categories,
  };
}

/** The integers printed in the preview's results section, in reading order. */
export function printedResultNumbers(previewText) {
  const start = previewText.indexOf('Périmètre analysé');
  const end = previewText.indexOf('À traiter en premier');
  if (start === -1 || end === -1 || end < start) return null;
  // Thousands are grouped with a no-break space in French; plain spaces
  // separate the figures of one row, so they never join two numbers.
  return (previewText.slice(start, end).match(/\d{1,3}(?:[\u202f\u00a0]\d{3})+|\d+/g) ?? []).map(
    (token) => Number(token.replace(/[\u202f\u00a0]/g, '')),
  );
}

/** Each printed figure that disagrees with its source, as a sentence. */
export function previewFigureMismatches(expected, previewText) {
  const printed = printedResultNumbers(previewText);
  if (printed === null) return ['the results section was not found in the preview text'];
  const severities = SEVERITIES.map((key) => expected.severity[key]).filter((count) => count > 0);
  const categories = Object.values(expected.categories)
    .filter((count) => count > 0)
    .sort((left, right) => right - left);
  const named = [
    ['inventoried pages', expected.inventoried],
    ['content-checked pages', expected.contentChecked],
    ['performance-measured pages', expected.performanceMeasured],
    ['distinct findings', expected.findings],
    ['affected pages', expected.affectedPages],
    ...severities.map((count, index) => [`severity total ${index + 1}`, count]),
  ];
  const mismatches = [];
  named.forEach(([label, value], index) => {
    if (printed[index] !== value) {
      mismatches.push(`${label}: printed ${printed[index] ?? 'nothing'}, source ${value}`);
    }
  });
  const printedCategories = printed
    .slice(named.length)
    .sort((left, right) => right - left)
    .join(',');
  if (printedCategories !== categories.join(',')) {
    mismatches.push(
      `category totals: printed ${printedCategories}, source ${categories.join(',')}`,
    );
  }
  return mismatches;
}
