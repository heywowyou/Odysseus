/**
 * The report-facing semantic classifier for Plan 059 step 26
 * (`PageSemanticProfile`, plan section 5.14).
 *
 * This is an interpretation aid for the report, never a second scheduler.
 * It reads the already-persisted scheduling-side `PageAuditProfile` signals
 * and gives each scanned page one semantic role with a confidence, the
 * reason codes naming the mechanism that fired, and the signal kinds the
 * role actually rests on. Scheduling keeps using
 * `full-audit-plan.ts`'s own classification: nothing here feeds back into
 * what a page is checked, and an `unknown` or low-confidence role is a
 * valid, expected outcome that gates and suppresses nothing.
 *
 * Every rule is a deterministic pure function of the profile. The
 * vocabulary (`PageSemanticRole`) is deliberately distinct from the
 * scheduler's `AuditPageRole`: the report speaks of commercial, archive
 * and legal pages, not of scheduling passes.
 */
import {
  buildPageSemanticProfile,
  type PageSemanticProfile,
  type PageSemanticRole,
} from './evidence-ledger.js';
import { LISTING_SIGNAL_KINDS } from './full-audit-plan.js';
import type { PageAuditProfile, PageRoleSignalKind } from './page-audit-profile.js';

export const PAGE_SEMANTIC_CLASSIFIER_VERSION = 'page-semantic-classifier-v1';

type SemanticConfidence = 'high' | 'medium' | 'low';

export interface PageSemanticClassification {
  semanticRole: PageSemanticRole;
  confidence: SemanticConfidence;
  /** The mechanism that fired, one code per piece of independent evidence,
   *  including the losing mechanisms of a resolved conflict: nothing the
   *  classifier saw is hidden from the report. */
  reasonCodes: readonly string[];
  /** The `PageRoleSignalKind` values the classification actually read.
   *  Empty when the role rests on the page's URL alone (legal) or on the
   *  absence of any signal (unknown). */
  evidenceRefs: readonly string[];
}

/** JSON-LD types that name something the site sells or operates: the
 *  commercial face of the site. A subset of page-audit-profile.ts's
 *  `CONTENT_JSON_LD_TYPES`, which is why the scheduler never needed this
 *  split and the report does. */
const COMMERCIAL_JSON_LD_TYPES = new Set([
  'Product',
  'Hotel',
  'LodgingBusiness',
  'Resort',
  'BedAndBreakfast',
]);

/** JSON-LD types that name editorial or reference content. */
const EDITORIAL_JSON_LD_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle', 'FAQPage']);

/** Pages whose URL names a legal-disclosure family (legal notice, terms,
 *  privacy, cookies). A URL is naming evidence, not content evidence, so a
 *  legal classification is capped at medium confidence; the mentions-legales
 *  vocabulary follows the crawl's own `findMentionsLegalesUrl` families
 *  (checks/mentions-legales.ts), broadened with the other disclosure-page
 *  names a hotel site actually carries. */
const LEGAL_PATH_PATTERN =
  /mentions?-legales?|mentions?-(?:et-)?(?:credits|informations)|informations?-legales?|conditions-generales|\bcgu\b|\bcgv\b|legal-notices?|\blegals\b|privacy|confidentialite|cookie|\/terms(\/|$)/i;

function legalPathMatches(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // A relative or malformed identity still gets the raw-string test.
  }
  return LEGAL_PATH_PATTERN.test(path);
}

/** One role per independent piece of evidence, before conflict resolution.
 *  The order is the precedence used when several fire at once. */
interface RoleClaim {
  semanticRole: PageSemanticRole;
  confidence: SemanticConfidence;
  reasonCodes: readonly string[];
  evidenceRefs: readonly PageRoleSignalKind[];
}

const ROLE_PRECEDENCE: readonly PageSemanticRole[] = [
  'legal',
  'transactional',
  'archive',
  'commercial',
  'content',
];

function roleClaimsOf(profile: PageAuditProfile): RoleClaim[] {
  const claims: RoleClaim[] = [];
  const kinds = new Set(profile.roleSignals.map((signal) => signal.kind));
  const detailOf = (kind: PageRoleSignalKind): string[] =>
    profile.roleSignals.filter((signal) => signal.kind === kind).map((signal) => signal.detail);

  if (legalPathMatches(profile.url)) {
    claims.push({
      semanticRole: 'legal',
      confidence: 'medium',
      reasonCodes: ['legal-path-url'],
      evidenceRefs: [],
    });
  }

  if (kinds.has('transactional-form') || kinds.has('external-transactional-link')) {
    claims.push({
      semanticRole: 'transactional',
      confidence: 'high',
      reasonCodes: [
        ...(kinds.has('transactional-form') ? ['transactional-form-detected'] : []),
        ...(kinds.has('external-transactional-link') ? ['transactional-link-out-detected'] : []),
      ],
      evidenceRefs: [
        ...(kinds.has('transactional-form') ? ['transactional-form' as const] : []),
        ...(kinds.has('external-transactional-link')
          ? ['external-transactional-link' as const]
          : []),
      ],
    });
  }

  const listingKinds = LISTING_SIGNAL_KINDS.filter((kind) => kinds.has(kind));
  if (listingKinds.length >= 2) {
    claims.push({
      semanticRole: 'archive',
      confidence: 'high',
      reasonCodes: [`archive-signals:${listingKinds.join(',')}`],
      evidenceRefs: listingKinds,
    });
  }

  const commercialTypes = detailOf('content-json-ld-type').filter((type) =>
    COMMERCIAL_JSON_LD_TYPES.has(type),
  );
  if (commercialTypes.length > 0) {
    claims.push({
      semanticRole: 'commercial',
      confidence: 'high',
      reasonCodes: [`commercial-json-ld:${[...new Set(commercialTypes)].sort().join(',')}`],
      evidenceRefs: ['content-json-ld-type'],
    });
  }

  const editorialTypes = detailOf('content-json-ld-type').filter((type) =>
    EDITORIAL_JSON_LD_TYPES.has(type),
  );
  if (editorialTypes.length > 0) {
    claims.push({
      semanticRole: 'content',
      confidence: 'high',
      reasonCodes: [`content-json-ld:${[...new Set(editorialTypes)].sort().join(',')}`],
      evidenceRefs: ['content-json-ld-type'],
    });
  }

  return claims;
}

/**
 * Classifies one page's semantic role from its persisted audit-profile
 * signals. The one deliberate conflict is the scheduler's own: strong
 * archive evidence together with explicit content JSON-LD means the page
 * itself declares two purposes, and the classifier does not guess — it
 * answers `conflicting` at low confidence. Every other overlap resolves by
 * the fixed precedence above, keeping the winning mechanism and recording
 * the losers among the reason codes.
 */
export function classifyPageSemanticRole(profile: PageAuditProfile): PageSemanticClassification {
  const claims = roleClaimsOf(profile);

  const archive = claims.find((claim) => claim.semanticRole === 'archive');
  const contentLike = claims.find(
    (claim) => claim.semanticRole === 'commercial' || claim.semanticRole === 'content',
  );
  if (archive !== undefined && contentLike !== undefined) {
    return {
      semanticRole: 'conflicting',
      confidence: 'low',
      reasonCodes: [
        'conflicting-archive-and-content-signals',
        ...archive.reasonCodes,
        ...contentLike.reasonCodes,
      ],
      evidenceRefs: [...archive.evidenceRefs, ...contentLike.evidenceRefs],
    };
  }

  if (claims.length > 0) {
    const winner = ROLE_PRECEDENCE.map((role) =>
      claims.find((claim) => claim.semanticRole === role),
    ).find((claim) => claim !== undefined);
    if (winner !== undefined) {
      return {
        semanticRole: winner.semanticRole,
        confidence: winner.confidence,
        reasonCodes: [
          ...winner.reasonCodes,
          ...claims
            .filter((claim) => claim !== winner)
            .flatMap((claim) => claim.reasonCodes)
            .map((code) => `${code}:outvoted`),
        ],
        evidenceRefs: winner.evidenceRefs,
      };
    }
  }

  const kinds = new Set(profile.roleSignals.map((signal) => signal.kind));
  const listingKindCount = LISTING_SIGNAL_KINDS.filter((kind) => kinds.has(kind)).length;
  if (listingKindCount === 1) {
    // A single weak listing signal cannot even promote the scheduler's own
    // role; it certainly cannot name a report-facing one.
    return {
      semanticRole: 'unknown',
      confidence: 'low',
      reasonCodes: ['insufficient-archive-signals'],
      evidenceRefs: [],
    };
  }
  return {
    semanticRole: 'unknown',
    confidence: 'low',
    reasonCodes: ['no-role-signals'],
    evidenceRefs: [],
  };
}

/** Joins one scanned page identity with its (possibly absent) persisted
 *  audit profile to produce the report-facing contract. A page whose
 *  signals were never extracted (a discovery-wave page, or an older run)
 *  gets an explicit `unknown` profile that says so, rather than being
 *  silently dropped from the report's own data. */
export function semanticProfileForPage(
  pageIdentity: string,
  profile: PageAuditProfile | undefined,
): PageSemanticProfile {
  if (profile === undefined) {
    return buildPageSemanticProfile({
      pageIdentity,
      semanticRole: 'unknown',
      confidence: 'low',
      reasonCodes: ['page-audit-profile-absent'],
      evidenceRefs: [],
      pageAuditProfileVersion: 'absent',
      classifierVersion: PAGE_SEMANTIC_CLASSIFIER_VERSION,
    });
  }
  const classification = classifyPageSemanticRole(profile);
  return buildPageSemanticProfile({
    pageIdentity,
    semanticRole: classification.semanticRole,
    confidence: classification.confidence,
    reasonCodes: classification.reasonCodes,
    evidenceRefs: classification.evidenceRefs,
    pageAuditProfileVersion: profile.profileVersion,
    classifierVersion: PAGE_SEMANTIC_CLASSIFIER_VERSION,
  });
}
