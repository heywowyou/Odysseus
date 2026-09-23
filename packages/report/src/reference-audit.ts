/**
 * Publication-safe projection for the permanent reference audit.
 *
 * This module deliberately sits in `report`: the source is a stored report
 * bundle, the output is still the normal paid-report input, and no Mongo or
 * bucket client belongs here. The projection is detached from its source and
 * the source objects are never mutated.
 */

import {
  assessObligations,
  buildFindingsProvenance,
  canonicalDigest,
  FINDINGS_SCHEMA_VERSION,
  type AuditManifest,
  type AuditManualFields,
  type Finding,
  type FindingElement,
  type ObligationAssessment,
  type OperatorProfile,
  type SiteSignals,
} from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION, SYNTHETIC_REGISTRY_SOURCE } from './constants.js';
import type { RenderBundle, ReportRenderInputs } from './render-bundle.js';
import type { StoredAnalysis } from './types.js';

export const REFERENCE_AUDIT_ANONYMIZER_VERSION = 'reference-anonymizer-v1';
export const REFERENCE_AUDIT_RELEASE_VERSION = 'reference-release-v1';
export const REFERENCE_AUDIT_CANONICAL_PATH = '/exemple-audit';
export const REFERENCE_AUDIT_DISCLOSURE_FR =
  "Exemple de rapport. L'identité de l'établissement, son site et ses données administratives ont été remplacés. Les constats et mesures proviennent d'un audit anonymisé et servent uniquement à illustrer le livrable ; ils ne décrivent pas l'établissement fictif présenté ici.";
export const REFERENCE_AUDIT_DATA_DISCLOSURE_FR =
  'Données de terrain conservées dans l’audit anonymisé : elles illustrent le livrable et ne décrivent pas Hôtel Exemple.';

const SHOWCASE_ORIGIN = 'https://www.hotel-exemple.fr';
const SHOWCASE_NAME = 'Hôtel Exemple';
const SHOWCASE_LEGAL_NAME = 'Hôtel Exemple — identité de démonstration';
const SHOWCASE_SIREN = '000000000';
/** The date the example carries when the caller names none. A release passes
 *  its own render day, so the audit date, the render date and every
 *  "since"-style sentence agree with each other and with the day it went
 *  public, without revealing when the source site was scanned. */
const DEFAULT_SHOWCASE_DATE = new Date('2026-01-15T00:00:00.000Z');

export interface ReferenceAuditSource {
  manifest: AuditManifest;
  findings: readonly Finding[];
  analysis: StoredAnalysis;
  renderInputs?: ReportRenderInputs;
  /** The date the example is presented as; defaults to a fixed day. */
  showcaseDate?: Date;
}

export interface ReferenceAuditShowcaseBundle {
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
  renderInputs: ReportRenderInputs;
  releaseVersion: string;
  anonymizerVersion: string;
  disclosure: string;
}

export interface ReferenceAuditShowcase {
  bundle: ReferenceAuditShowcaseBundle;
  /** Kept in memory by the release gate; never written to the public object. */
  sourceDenylist: readonly string[];
}

export class ReferenceAuditPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceAuditPublicationError';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('fr-FR').trim();
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else {
    const record = asRecord(value);
    if (record !== null) {
      for (const [key, child] of Object.entries(record)) {
        output.push(key);
        collectStrings(child, output);
      }
    }
  }
  return output;
}

function collectLeafStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectLeafStrings(item, output);
  } else {
    const record = asRecord(value);
    if (record !== null) {
      for (const child of Object.values(record)) collectLeafStrings(child, output);
    }
  }
  return output;
}

function collectIdentityMarkers(value: string): string[] {
  const markers = [
    ...(value.match(/https?:\/\/[^\s<>'"]+/giu) ?? []),
    ...(value.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu) ?? []),
    ...(value.match(/\b\d{9,14}\b/gu) ?? []),
    ...(value.match(/\+?\d[\d .()/-]{7,}\d/gu) ?? []),
  ];
  return markers.filter(
    (marker) =>
      !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(
        marker,
      ),
  );
}

function collectIdentityStrings(source: ReferenceAuditSource): string[] {
  const values: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') values.push(value);
  };
  const manifest = source.manifest;
  add(manifest.siteUrl);
  add(manifest.crawl.startUrl);
  for (const page of manifest.pages) {
    add(page.url);
    add(page.discoveredFrom);
    add(page.redirectTargetUrl);
  }
  const siteSignals = asRecord(manifest.siteSignals);
  if (siteSignals !== null) {
    for (const [key, value] of Object.entries(siteSignals)) {
      if (
        /siren|siret|name|address|phone|email|url|domain|selector|snippet|identifier/iu.test(key)
      ) {
        for (const child of collectStrings(value)) add(child);
      }
    }
  }
  const manualFields = asRecord(source.renderInputs?.manualFields);
  if (manualFields !== null) {
    for (const [key, value] of Object.entries(manualFields)) {
      if (/address|company|denomination|email|legal|name|phone|siren|siret|url/iu.test(key)) {
        for (const child of collectLeafStrings(value)) add(child);
      }
    }
  }
  const siteContext = asRecord(source.analysis.siteContext);
  if (siteContext !== null) {
    for (const [key, value] of Object.entries(siteContext)) {
      if (/business|city|company|domain|hotel|name|property|site|url/iu.test(key)) {
        for (const child of collectLeafStrings(value)) add(child);
      }
    }
  }
  for (const finding of source.findings) {
    for (const element of finding.elements) {
      add(element.pageUrl);
      add(element.resourceUrl);
    }
    // Rule titles, descriptions, selectors and snippets are mostly shared
    // vocabulary ("speed index", "anchor", "fonts", ...), not identity.
    // Only retain them as denylist material when they carry an unambiguous
    // identity marker. The projection replaces every element independently,
    // so generic selector text must not turn the leak gate into a false
    // positive against the normal report renderer.
    for (const value of [finding.title, finding.description]) {
      for (const marker of collectIdentityMarkers(value)) add(marker);
    }
    for (const value of collectLeafStrings(finding.rawEvidence)) {
      for (const marker of collectIdentityMarkers(value)) add(marker);
    }
  }
  const analysisStrings = collectLeafStrings(source.analysis);
  for (const value of analysisStrings) {
    for (const marker of collectIdentityMarkers(value)) add(marker);
  }
  return values;
}

function buildSourceDenylist(source: ReferenceAuditSource): string[] {
  const common = new Set([
    'https',
    'http',
    'www',
    'com',
    'fr',
    'org',
    'site',
    'page',
    'pages',
    'audit',
    'analyse',
    'analysis',
    'constat',
    'finding',
    'example',
    'exemple',
    'mentions-legales',
    'themes',
    'legacy',
    'admin',
    // Render-input provenance is metadata, not source identity. These values
    // can legitimately survive in the detached synthetic bundle (for example
    // the replacement manual fields are operator-provided), so they must not
    // become denylist tokens merely because they sit under an identity-shaped
    // key in the source bundle.
    'operator',
    'manual',
    'detected',
    'fallback',
    'extracted',
    'synthetic-showcase',
  ]);
  const candidates = new Set<string>();
  let sourceHostname: string | undefined;
  try {
    sourceHostname = new URL(source.manifest.siteUrl).hostname.toLocaleLowerCase('fr-FR');
  } catch {
    // The source manifest is validated upstream; malformed historical URLs
    // still remain useful as exact denylist entries below.
  }
  for (const raw of collectIdentityStrings(source)) {
    const value = normalized(raw);
    if (value.length >= 4 && !common.has(value)) candidates.add(value);
    if (value.includes('://')) {
      try {
        const url = new URL(value);
        const hostname = url.hostname.toLocaleLowerCase('fr-FR');
        candidates.add(normalized(hostname));
        if (hostname === sourceHostname) {
          for (const fragment of hostname.split(/[.-]/u)) {
            if (fragment.length >= 6 && !common.has(fragment)) candidates.add(fragment);
          }
        }
      } catch {
        // The raw value remains useful as an exact denylist entry.
      }
    }
  }
  const sourcePageUrls = new Set<string>([
    ...source.manifest.pages.map((page) => page.url),
    ...source.findings.flatMap((finding) => [
      ...finding.pageUrls,
      ...finding.elements.map((element) => element.pageUrl),
    ]),
  ]);
  for (const raw of sourcePageUrls) {
    try {
      const url = new URL(raw);
      const hostname = url.hostname.toLocaleLowerCase('fr-FR');
      if (hostname !== sourceHostname) continue;
      const pathname = normalized(url.pathname);
      if (
        pathname.length > 1 &&
        !/^\/(?:contact|mentions-legales|reservation|restaurant|chambres?)\/?$/u.test(pathname)
      ) {
        candidates.add(pathname);
      }
    } catch {
      // The exact source URL is already in the denylist when it is available.
    }
  }
  return [...candidates]
    .filter((value) => value !== normalized(SHOWCASE_ORIGIN))
    .sort((a, b) => b.length - a.length);
}

/** A language segment says nothing about the source business, and keeping
 *  it lets the example's page list agree with the languages it reports. */
function pathRole(pathname: string): string {
  const language = /^\/([a-z]{2})(?:\/|$)/u.exec(pathname.toLocaleLowerCase('fr-FR'))?.[1];
  const rest = language === undefined ? pathname : pathname.slice(language.length + 1);
  const role = contentRole(rest);
  if (language === undefined) return role;
  return role === '/' ? `/${language}` : `/${language}${role}`;
}

function contentRole(pathname: string): string {
  const path = pathname.toLocaleLowerCase('fr-FR');
  if (path === '' || path === '/') return '/';
  if (/reservation|réservation|booking|book/iu.test(path)) return '/reservation';
  if (/chambre|room|suite/iu.test(path)) return '/chambres';
  if (/contact/iu.test(path)) return '/contact';
  if (/mention|legal|imprint/iu.test(path)) return '/mentions-legales';
  if (/restaurant|table|dining/iu.test(path)) return '/restaurant';
  if (/spa|bien-être|wellness/iu.test(path)) return '/bien-etre';
  if (/galer|photo|gallery/iu.test(path)) return '/galerie';
  if (/offre|offer|promo|package/iu.test(path)) return '/offres';
  if (/faq|question/iu.test(path)) return '/questions-frequentes';
  if (/actualit|news|blog|article/iu.test(path)) return '/actualites';
  if (/ecolog|engagement|commitment|durable|sustainab/iu.test(path)) return '/engagements';
  if (/acces|access|plan|location|quartier|neighbo|around|alentour/iu.test(path)) return '/acces';
  if (/service|concierg|menu|directory/iu.test(path)) return '/services';
  if (/avis|review|temoign|testimon/iu.test(path)) return '/avis';
  if (/histo|story|about|propos/iu.test(path)) return '/histoire';
  return '/page';
}

function createPageUrlMap(source: ReferenceAuditSource): Map<string, string> {
  const sourceUrls = new Set<string>();
  for (const page of source.manifest.pages) sourceUrls.add(page.url);
  for (const finding of source.findings) {
    for (const pageUrl of finding.pageUrls) sourceUrls.add(pageUrl);
    for (const element of finding.elements) sourceUrls.add(element.pageUrl);
  }
  const entries = [...sourceUrls].sort();
  const counts = new Map<string, number>();
  const result = new Map<string, string>();
  for (const raw of entries) {
    let pathname = '/page';
    try {
      pathname = pathRole(new URL(raw).pathname);
    } catch {
      // An invalid historical URL still gets a synthetic page role.
    }
    const seen = (counts.get(pathname) ?? 0) + 1;
    counts.set(pathname, seen);
    const uniquePath = seen === 1 ? pathname : `${pathname}-${seen}`;
    result.set(raw, `${SHOWCASE_ORIGIN}${uniquePath === '/' ? '/' : uniquePath}`);
  }
  return result;
}

function replaceSourceStrings(value: string, denylist: readonly string[]): string {
  let result = value;
  for (const token of denylist) {
    if (token.length < 4) continue;
    result = result.replace(new RegExp(escapeRegExp(token), 'giu'), 'Hôtel Exemple');
  }
  result = result.replace(/https?:\/\/[^\s<>'"]+/giu, `${SHOWCASE_ORIGIN}/page`);
  result = result.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, 'contact@hotel-exemple.fr');
  result = result.replace(/\b\d{9,14}\b/gu, SHOWCASE_SIREN);
  result = result.replace(/\+?\d[\d .()/-]{7,}\d/gu, '+33 1 00 00 00 00');
  return result;
}

/** Source analysis may discuss real visitors or field measurements. Those
 *  facts are retained for the showcase's instructional value, but the
 *  synthetic hostname must never appear to own them. Keep this rewrite
 *  narrow: it changes provenance wording, not counts, findings, or claims. */
function replaceReferenceMeasurementClaims(value: string): string {
  return value
    .replace(
      /stabilité visuelle mesuré(?:e|es)? auprès de visiteurs réels/giu,
      'stabilité visuelle mesurée dans les données de terrain conservées dans l’audit anonymisé',
    )
    .replace(
      /observé(?:e|es)?s? auprès de ces visiteurs/giu,
      'observées dans ces données de terrain',
    )
    .replace(
      /mesures issues de visiteurs réels/giu,
      'mesures de terrain conservées dans l’audit anonymisé',
    )
    .replace(/visiteurs réels/giu, 'données de terrain conservées dans l’audit anonymisé')
    .replace(/usages réels/giu, 'données de terrain conservées dans l’audit anonymisé')
    .replace(
      /données réelles du Chrome UX Report/giu,
      'données de terrain de l’audit anonymisé (Chrome UX Report)',
    )
    .replace(/real visitors/giu, 'field data retained in the anonymized audit')
    .replace(/real-world Chrome UX Report data/giu, 'field data from the anonymized audit');
}

function projectCopy(value: string, denylist: readonly string[]): string {
  return replaceReferenceMeasurementClaims(replaceSourceStrings(value, denylist));
}

function rewriteUrl(raw: string, pageUrls: ReadonlyMap<string, string>): string {
  const direct = pageUrls.get(raw);
  if (direct !== undefined) return direct;
  try {
    const url = new URL(raw);
    const path = pathRole(url.pathname);
    return `${SHOWCASE_ORIGIN}${path === '/' ? '/' : path}`;
  } catch {
    return `${SHOWCASE_ORIGIN}/page`;
  }
}

function sanitizeUnknown(
  value: unknown,
  denylist: readonly string[],
  pageUrls: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') return replaceSourceStrings(value, denylist);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item, denylist, pageUrls));
  const record = asRecord(value);
  if (record === null) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      replaceSourceStrings(key, denylist),
      sanitizeUnknown(child, denylist, pageUrls),
    ]),
  );
}

function syntheticObligationAssessment(showcaseDate: Date): ObligationAssessment {
  const retrievedAt = new Date(showcaseDate);
  const profile: OperatorProfile = {
    siren: { value: SHOWCASE_SIREN, source: 'synthetic-showcase', retrievedAt },
    denomination: { value: SHOWCASE_LEGAL_NAME, source: 'synthetic-showcase', retrievedAt },
    naf: { value: '5510Z', source: 'synthetic-showcase', retrievedAt },
    legalForm: { value: 'Entreprise de démonstration', source: 'synthetic-showcase', retrievedAt },
    effectifBand: {
      value: { code: '12', label: '10 à 19 salariés' },
      source: 'synthetic-showcase',
      retrievedAt,
    },
    turnover: { value: null, source: 'synthetic-showcase', retrievedAt },
  };
  const signals: SiteSignals = {
    hasTransactionalFlow: true,
    transactionalFlowEvidence: [
      {
        kind: 'booking-engine-domain-reference',
        selector: '[data-showcase-booking]',
        pageUrl: `${SHOWCASE_ORIGIN}/reservation`,
        detail: 'Synthetic showcase evidence',
      },
    ],
  };
  const assessed = assessObligations(profile, signals);
  return {
    ...assessed,
    sector: 'hospitality',
    sirenSource: 'manual',
    registrySnapshot: {
      denomination: SHOWCASE_LEGAL_NAME,
      effectifBandLabel: '10 à 19 salariés',
      retrievedAt,
      source: SYNTHETIC_REGISTRY_SOURCE,
    },
  };
}

function syntheticManualFields(showcaseDate: Date): AuditManualFields {
  return {
    siren: { value: SHOWCASE_SIREN, provenance: 'operator' },
    sirenSourceUrl: { value: `${SHOWCASE_ORIGIN}/mentions-legales`, provenance: 'operator' },
    raisonSociale: { value: SHOWCASE_LEGAL_NAME, provenance: 'operator' },
    nomCommercial: { value: SHOWCASE_NAME, provenance: 'operator' },
    sector: { value: 'hospitality', provenance: 'operator' },
    declarationContactEmail: { value: 'contact@hotel-exemple.fr', provenance: 'operator' },
    updatedAt: new Date(showcaseDate),
  };
}

function hasImageEvidence(value: unknown, key = ''): boolean {
  if (
    /screenshot|image|photo|thumbnail/iu.test(key) &&
    value !== undefined &&
    value !== null &&
    value !== false &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0)
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.some((item) => hasImageEvidence(item, key));
  const record = asRecord(value);
  return (
    record !== null &&
    Object.entries(record).some(([childKey, child]) => hasImageEvidence(child, childKey))
  );
}

/** An id outside the projected set still gets a synthetic, source-free label.
 *  The four-hex-digit form cannot collide with the three-digit sequence above. */
function mapFindingId(id: string, findingIds: ReadonlyMap<string, string>): string {
  return findingIds.get(id) ?? `f${canonicalDigest(id).slice(-4)}`;
}

function projectFinding(
  finding: Finding,
  pageUrls: ReadonlyMap<string, string>,
  findingIds: ReadonlyMap<string, string>,
  denylist: readonly string[],
  showcaseDate: Date,
): Finding {
  const elements: FindingElement[] = finding.elements.map((element, index) => ({
    pageUrl: rewriteUrl(element.pageUrl, pageUrls),
    // A frame-crossing selector keeps its boundary, so content from an
    // embedded third-party frame stays attributed to it in the example as
    // it is in the source report.
    selector: `${element.selector.includes('>>>') ? 'iframe[data-showcase-frame] >>> ' : ''}[data-showcase-${finding.category}="${index + 1}"]`,
    snippet: `<div data-showcase-element="${finding.category}">Élément de démonstration</div>`,
  }));
  const projected: Finding = {
    ...finding,
    findingId: mapFindingId(finding.findingId, findingIds),
    auditId: 'reference-audit',
    pageUrls: finding.pageUrls.map((url) => rewriteUrl(url, pageUrls)),
    elements,
    title: projectCopy(finding.title, denylist),
    description: projectCopy(finding.description, denylist),
    rawEvidence: { showcaseProjection: true, category: finding.category, ruleId: finding.ruleId },
    dedupeKey: `showcase|${finding.source}|${finding.ruleId}|${finding.category}`,
    firstSeenAt: new Date(showcaseDate),
    lastSeenAt: new Date(showcaseDate),
  };
  delete projected.helpUrl;
  return projected;
}

function projectManifest(
  manifest: AuditManifest,
  pageUrls: ReadonlyMap<string, string>,
  denylist: readonly string[],
  showcaseDate: Date,
): AuditManifest {
  const sanitized = sanitizeUnknown(manifest, denylist, pageUrls) as AuditManifest;
  delete sanitized.prospectId;
  delete sanitized.continuationGuardSummary;
  delete sanitized.renormalizedAt;
  return {
    ...sanitized,
    auditId: 'reference-audit',
    scanIntent: 'full-audit',
    siteUrl: `${SHOWCASE_ORIGIN}/`,
    startedAt: showcaseDate.toISOString(),
    finishedAt: showcaseDate.toISOString(),
    crawl: { ...sanitized.crawl, startUrl: `${SHOWCASE_ORIGIN}/` },
    pages: manifest.pages.map((page, index) => {
      const pageCopy = { ...sanitized.pages[index]! };
      delete pageCopy.pageDir;
      return {
        ...pageCopy,
        url: rewriteUrl(page.url, pageUrls),
        ...(page.discoveredFrom === undefined
          ? {}
          : { discoveredFrom: rewriteUrl(page.discoveredFrom, pageUrls) }),
        ...(page.redirectTargetUrl === undefined
          ? {}
          : { redirectTargetUrl: rewriteUrl(page.redirectTargetUrl, pageUrls) }),
        ...(page.crawlError === undefined
          ? {}
          : { crawlError: replaceSourceStrings(page.crawlError, denylist) }),
        errors: Object.fromEntries(
          Object.entries(page.errors).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, replaceSourceStrings(value, denylist)]],
          ),
        ) as AuditManifest['pages'][number]['errors'],
      };
    }),
    siteSignals: {
      hasTransactionalFlow: true,
      transactionalFlowEvidence: [
        {
          kind: 'booking-engine-domain-reference',
          selector: '[data-showcase-booking]',
          pageUrl: `${SHOWCASE_ORIGIN}/reservation`,
          detail: 'Synthetic showcase evidence',
        },
      ],
      siren: SHOWCASE_SIREN,
      mentionsLegalesPageUrl: `${SHOWCASE_ORIGIN}/mentions-legales`,
    },
  };
}

function projectAnalysis(
  analysis: StoredAnalysis,
  findingIds: ReadonlyMap<string, string>,
  denylist: readonly string[],
  showcaseDate: Date,
): StoredAnalysis {
  const projected = sanitizeUnknown(analysis, denylist, new Map()) as StoredAnalysis;
  delete projected.findingsProvenance;
  delete projected.writingCritic;
  delete projected.structureGeneratedAt;
  delete projected.generationMode;
  return {
    ...projected,
    auditId: 'reference-audit',
    analysisId: `reference-analysis-${analysis.language}`,
    model: 'reference-showcase',
    temperature: 0,
    generatedAt: new Date(showcaseDate),
    siteContext: {
      businessType: 'Hôtel indépendant',
      primaryGoal: 'Présenter une expérience de réservation accessible',
      languagesServed: ['fr'],
      targetMarkets: ['France'],
      sizeBracket: 'PME',
      propertyType: 'Hôtel',
      city: 'Ville Exemple',
      sector: 'hospitality',
    },
    themes: analysis.themes.map((theme) => ({
      ...theme,
      findingIds: theme.findingIds.map((id) => mapFindingId(id, findingIds)),
      title: projectCopy(theme.title, denylist),
      businessImpact: projectCopy(theme.businessImpact, denylist),
      legalRelevance:
        theme.legalRelevance === undefined
          ? undefined
          : projectCopy(theme.legalRelevance, denylist),
      recommendedActions: theme.recommendedActions.map((action) => projectCopy(action, denylist)),
    })),
    quickWins: analysis.quickWins.map((id) => mapFindingId(id, findingIds)),
    executiveSummary: projectCopy(analysis.executiveSummary, denylist),
    notes: projectCopy(analysis.notes, denylist),
    obligationAssessment: syntheticObligationAssessment(showcaseDate),
  };
}

export function buildReferenceAuditShowcase(source: ReferenceAuditSource): ReferenceAuditShowcase {
  const denylist = buildSourceDenylist(source);
  const pageUrls = createPageUrlMap(source);
  // Synthetic ids keep the production `f001` shape. A longer label would both
  // overflow the appendix's identifier column and make the example read
  // differently from the deliverable it represents.
  const findingIds = new Map(
    source.findings.map((finding, index) => [
      finding.findingId,
      `f${String(index + 1).padStart(3, '0')}`,
    ]),
  );
  const showcaseDate = source.showcaseDate ?? DEFAULT_SHOWCASE_DATE;
  const manifest = projectManifest(source.manifest, pageUrls, denylist, showcaseDate);
  const findings = source.findings.map((finding) =>
    projectFinding(finding, pageUrls, findingIds, denylist, showcaseDate),
  );
  const analysis = projectAnalysis(source.analysis, findingIds, denylist, showcaseDate);
  const renderInputs: ReportRenderInputs = {
    manualFields: syntheticManualFields(showcaseDate),
    obligationAssessment: syntheticObligationAssessment(showcaseDate),
    ...(source.renderInputs?.preparation === undefined
      ? {}
      : {
          preparation: sanitizeUnknown(
            source.renderInputs.preparation,
            denylist,
            pageUrls,
          ) as NonNullable<ReportRenderInputs['preparation']>,
        }),
  };
  const findingsProvenance = buildFindingsProvenance(findings);
  manifest.findingsProvenance = findingsProvenance;
  analysis.findingsProvenance = findingsProvenance;
  const bundle: ReferenceAuditShowcaseBundle = {
    manifest,
    findings,
    analysis,
    renderInputs,
    releaseVersion: REFERENCE_AUDIT_RELEASE_VERSION,
    anonymizerVersion: REFERENCE_AUDIT_ANONYMIZER_VERSION,
    disclosure: REFERENCE_AUDIT_DISCLOSURE_FR,
  };
  // Checked on what is published, not on the source: the projection replaces
  // every finding's elements and raw evidence, so a screenshot reference in
  // the source never reaches the showcase, while one that survives the
  // projection (through a passed-through render input) still refuses it.
  if (hasImageEvidence(bundle)) {
    throw new ReferenceAuditPublicationError(
      'reference audit refused: showcase evidence contains an image or screenshot',
    );
  }
  assertReferenceAuditNoLeaks({ showcaseJson: bundle, denylist });
  return { bundle, sourceDenylist: denylist };
}

export interface ReferenceAuditLeakScanInput {
  showcaseJson?: unknown;
  html?: string;
  pdfText?: string;
  pdfMetadata?: Record<string, string | undefined>;
  embeddedObjectNames?: readonly string[];
  denylist: readonly string[];
}

export function findReferenceAuditLeaks(input: ReferenceAuditLeakScanInput): string[] {
  const values = [
    input.showcaseJson === undefined ? '' : JSON.stringify(input.showcaseJson),
    input.html ?? '',
    input.pdfText ?? '',
    ...Object.values(input.pdfMetadata ?? {}),
    ...(input.embeddedObjectNames ?? []),
  ];
  const haystack = values.join('\n').normalize('NFKC').toLocaleLowerCase('fr-FR');
  return [
    ...new Set(input.denylist.filter((token) => token.length >= 4 && haystack.includes(token))),
  ];
}

export function assertReferenceAuditNoLeaks(input: ReferenceAuditLeakScanInput): void {
  const leaks = findReferenceAuditLeaks(input);
  if (leaks.length > 0) {
    throw new ReferenceAuditPublicationError(
      `reference audit refused: source identity survived publication projection (${leaks.join(', ')})`,
    );
  }
}

export function referenceAuditManifestDigest(bundle: ReferenceAuditShowcaseBundle): string {
  return canonicalDigest({
    releaseVersion: bundle.releaseVersion,
    anonymizerVersion: bundle.anonymizerVersion,
    manifest: bundle.manifest,
    findings: bundle.findings,
    analysis: bundle.analysis,
  });
}

export function renderInputsForReferenceAudit(bundle: ReferenceAuditShowcaseBundle): RenderBundle {
  return {
    lineage: {
      auditId: bundle.manifest.auditId,
      language: bundle.analysis.language,
      analysisId: bundle.analysis.analysisId ?? `reference-analysis-${bundle.analysis.language}`,
      analysisDigest: canonicalDigest(bundle.analysis),
      findingsProvenance: {
        findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
        normalizationFingerprint: 'reference-audit-projection',
        findingsDigest: canonicalDigest(bundle.findings),
      },
      rendererBuild: 'reference-audit',
      reportTemplateVersion: REPORT_TEMPLATE_VERSION,
      builtAt: bundle.manifest.finishedAt ?? DEFAULT_SHOWCASE_DATE.toISOString(),
    },
    manifest: bundle.manifest,
    findings: bundle.findings,
    analysis: bundle.analysis,
    ...bundle.renderInputs,
  };
}
