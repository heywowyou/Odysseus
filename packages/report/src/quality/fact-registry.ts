import {
  ARTICLE_47_REGIME_ID,
  EAA_REGIME_ID,
  LCEN_MENTIONS_LEGALES_REGIME_ID,
  formatLocaleNumber,
  getRegime,
  type ApprovedAuditEvidencePayload,
  type Finding,
  type ReportFact,
  type ReportFactRegistry,
  type ReportInputSnapshot,
  type ReportLanguage,
  type ReportOnlyInputs,
} from '@odysseus/core';

/**
 * Plan 058 §5.2: every exact token a writer may need is a typed fact derived
 * from approved evidence or a code-owned registry, so no model retypes a
 * number, date, criterion or citation from memory. The first live pilots
 * showed what a thin registry costs: writers could not state a WCAG
 * criterion, a CrUX percentile, an occurrence count or the article 47
 * citation, so they wrote vague prose that the critics then rejected and no
 * repair could fix (the editor is bound by the same scalar ban).
 */

const LOCALE: Record<ReportLanguage, string> = { fr: 'fr-FR', en: 'en-GB' };

function formatNumber(value: number, language: ReportLanguage, fractionDigits = 0): string {
  return formatLocaleNumber(value, LOCALE[language], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function bilingual(format: (language: ReportLanguage) => string): Record<ReportLanguage, string> {
  return { fr: format('fr'), en: format('en') };
}

type MetricUnit = 'seconds' | 'milliseconds' | 'unitless' | 'kibibytes';

/** Lighthouse audits whose `numericValue` has a known unit. Anything not
 *  listed stays out of the registry rather than guessing a unit. */
const LAB_METRIC_UNITS: Readonly<Record<string, MetricUnit>> = {
  'first-contentful-paint': 'seconds',
  'largest-contentful-paint': 'seconds',
  'speed-index': 'seconds',
  interactive: 'seconds',
  'total-blocking-time': 'milliseconds',
  'max-potential-fid': 'milliseconds',
  'server-response-time': 'milliseconds',
  'bootup-time': 'milliseconds',
  'mainthread-work-breakdown': 'milliseconds',
  'cumulative-layout-shift': 'unitless',
  'total-byte-weight': 'kibibytes',
};

/** CrUX metric names as the scanner records them, with their p75 unit. */
const FIELD_METRIC_UNITS: Readonly<Record<string, MetricUnit>> = {
  largest_contentful_paint: 'milliseconds',
  first_contentful_paint: 'milliseconds',
  interaction_to_next_paint: 'milliseconds',
  experimental_time_to_first_byte: 'milliseconds',
  cumulative_layout_shift: 'unitless',
};

function formatMetric(value: number, unit: MetricUnit, language: ReportLanguage): string {
  const nbsp = language === 'fr' ? ' ' : ' ';
  switch (unit) {
    case 'seconds':
      return `${formatNumber(value / 1000, language, 1)}${nbsp}s`;
    case 'milliseconds':
      return `${formatNumber(Math.round(value), language)}${nbsp}ms`;
    case 'unitless':
      return formatNumber(value, language, 3);
    case 'kibibytes':
      return `${formatNumber(Math.round(value / 1024), language)}${nbsp}${language === 'fr' ? 'Kio' : 'KiB'}`;
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function perPageRecords(finding: Finding): Record<string, unknown>[] {
  const perPage = finding.rawEvidence['perPage'];
  if (perPage === null || typeof perPage !== 'object' || Array.isArray(perPage)) return [];
  return Object.values(perPage).filter(
    (value): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value),
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberFact(
  factId: string,
  value: number,
  label: string,
  sourceRefs: string[],
  display: Record<ReportLanguage, string> = bilingual((l) => formatNumber(value, l)),
): ReportFact {
  return { factId, kind: 'number', value, display, sourceRefs, label };
}

function findingFacts(finding: Finding, sourceRef: string): ReportFact[] {
  const id = finding.findingId;
  const refs = [id, sourceRef];
  const facts: ReportFact[] = [
    numberFact(`finding.${id}.pages`, finding.pageUrls.length, `pages affected by ${id}`, refs),
    numberFact(
      `finding.${id}.occurrences`,
      finding.occurrences,
      `occurrences of ${id} across all pages`,
      refs,
    ),
  ];
  const records = perPageRecords(finding);

  const labUnit = finding.source === 'lighthouse' ? LAB_METRIC_UNITS[finding.ruleId] : undefined;
  if (labUnit !== undefined) {
    const values = records.map((record) => record['numericValue']).filter(isFiniteNumber);
    if (values.length > 0) {
      const lab = (key: string, value: number, label: string) =>
        numberFact(
          `finding.${id}.lab.${key}`,
          value,
          `Lighthouse lab ${finding.ruleId} ${label} (lab measurement, not field data)`,
          refs,
          bilingual((l) => formatMetric(value, labUnit, l)),
        );
      facts.push(
        lab('median', median(values), `median over ${values.length} measured page(s)`),
        lab('worst', Math.max(...values), 'worst measured page'),
        numberFact(
          `finding.${id}.lab.pagesMeasured`,
          values.length,
          `pages with a Lighthouse ${finding.ruleId} lab measurement`,
          refs,
        ),
      );
    }
    return facts;
  }

  if (finding.ruleId.startsWith('crux-') && records.length === 1) {
    const record = records[0]!;
    const metric = record['metric'];
    const p75 = record['p75'];
    const unit = typeof metric === 'string' ? FIELD_METRIC_UNITS[metric] : undefined;
    if (unit !== undefined && isFiniteNumber(p75)) {
      facts.push(
        numberFact(
          `finding.${id}.field.p75`,
          p75,
          `CrUX field data (real visitors) 75th percentile of ${String(metric)}`,
          refs,
          bilingual((l) => formatMetric(p75, unit, l)),
        ),
      );
    }
    return facts;
  }

  // Single-record custom checks carry their own counts (pages searched,
  // providers contacted, orphan URLs); expose integers and list sizes only.
  if (finding.source === 'custom' && records.length === 1) {
    for (const [key, value] of Object.entries(records[0]!)) {
      if (isFiniteNumber(value) && Number.isInteger(value))
        facts.push(numberFact(`finding.${id}.${key}`, value, `${id} scanner field ${key}`, refs));
      else if (Array.isArray(value))
        facts.push(
          numberFact(
            `finding.${id}.${key}Count`,
            value.length,
            `${id} scanner list ${key} size`,
            refs,
          ),
        );
    }
  }
  return facts;
}

function referenceFact(
  factId: string,
  display: Record<ReportLanguage, string>,
  label: string,
  sourceRefs: string[],
): ReportFact {
  return { factId, kind: 'reference', value: display.en, display, sourceRefs, label };
}

export function buildReportFactRegistry(
  evidence: ApprovedAuditEvidencePayload,
  snapshot: ReportInputSnapshot,
  inputs: ReportOnlyInputs,
): ReportFactRegistry {
  const facts: ReportFact[] = [];
  const seen = new Set<string>();
  const add = (fact: ReportFact) => {
    if (seen.has(fact.factId)) return;
    seen.add(fact.factId);
    facts.push(fact);
  };
  const root = evidence.approval.auditEvidenceSnapshotDigest;
  const { manifest, findings } = evidence;

  add({
    factId: 'audit.siteUrl',
    kind: 'url',
    value: manifest.siteUrl,
    display: { fr: manifest.siteUrl, en: manifest.siteUrl },
    sourceRefs: [root],
    label: 'audited site URL',
  });
  add(
    numberFact('audit.pagesVisited', manifest.crawl.visitedCount, 'pages visited by the crawl', [
      root,
    ]),
  );
  add(numberFact('audit.findingCount', findings.length, 'confirmed findings in total', [root]));
  const auditDate = new Date(manifest.startedAt);
  if (!Number.isNaN(auditDate.getTime()))
    add({
      factId: 'audit.date',
      kind: 'date',
      value: manifest.startedAt,
      display: bilingual((l) =>
        new Intl.DateTimeFormat(LOCALE[l], {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/Paris',
        }).format(auditDate),
      ),
      sourceRefs: [root],
      label: 'date the audit scan started',
    });

  for (const severity of ['critical', 'serious', 'moderate', 'minor'] as const)
    add(
      numberFact(
        `findings.severity.${severity}`,
        findings.filter((finding) => finding.severity === severity).length,
        `findings of ${severity} severity`,
        [root],
      ),
    );
  for (const category of [...new Set(findings.map((finding) => finding.category))].sort())
    add(
      numberFact(
        `findings.category.${category}`,
        findings.filter((finding) => finding.category === category).length,
        `findings in the ${category} category`,
        [root],
      ),
    );

  add(
    referenceFact(
      'standard.wcag',
      { fr: 'WCAG 2.2 niveau AA', en: 'WCAG 2.2 level AA' },
      'accessibility standard the audit checks against',
      ['odysseus-product-scope'],
    ),
  );
  add(
    referenceFact(
      'standard.en301549',
      { fr: 'EN 301 549', en: 'EN 301 549' },
      'harmonised European accessibility standard',
      ['docs/rules/obligation-basis.md'],
    ),
  );
  for (const regimeId of [ARTICLE_47_REGIME_ID, EAA_REGIME_ID, LCEN_MENTIONS_LEGALES_REGIME_ID]) {
    const fr = getRegime(regimeId, 'fr');
    const en = getRegime(regimeId, 'en');
    if (fr && en)
      add(
        referenceFact(
          `legal.${regimeId}.citation`,
          { fr: fr.legalCitation, en: en.legalCitation },
          `legal citation of the ${regimeId} regime (citation only, never an applicability verdict)`,
          ['packages/core/src/compliance/regimes.ts'],
        ),
      );
  }

  for (const criterion of [...new Set(findings.flatMap((finding) => finding.wcagCriteria))].sort())
    add(
      referenceFact(
        `wcag.${criterion}`,
        { fr: criterion, en: criterion },
        `WCAG success criterion ${criterion} number (prose supplies the word "criterion")`,
        findings
          .filter((finding) => finding.wcagCriteria.includes(criterion))
          .map((finding) => finding.findingId),
      ),
    );

  for (const finding of findings) for (const fact of findingFacts(finding, root)) add(fact);

  const identity = (factId: string, value: string | undefined, label: string) => {
    if (value)
      add({
        factId,
        kind: 'identifier',
        value,
        display: { fr: value, en: value },
        sourceRefs: [snapshot.reportOnlyInputsDigest],
        label,
      });
  };
  identity('client.commercialName', inputs.manualFields?.nomCommercial?.value, 'trading name');
  identity('client.legalName', inputs.manualFields?.raisonSociale?.value, 'registered legal name');
  if (inputs.manualFields?.siren?.value)
    add({
      factId: 'identity.siren',
      kind: 'identifier',
      value: inputs.manualFields.siren.value,
      display: { fr: inputs.manualFields.siren.value, en: inputs.manualFields.siren.value },
      sourceRefs: [snapshot.reportOnlyInputsDigest],
      label: 'company SIREN',
    });
  return {
    registryVersion: '058-v2',
    inputSnapshotDigest: snapshot.approvedEvidenceDigest,
    facts,
  };
}
