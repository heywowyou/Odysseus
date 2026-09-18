/**
 * Shared synthetic evidence cases for Plan 059 tests.
 *
 * These are deliberately identifier-only fixtures: no live hosts, no stored
 * client material, and no hand-authored replacement for the real-audit corpus
 * required by done criterion 43. They exercise fail-closed logic only.
 */
export const evidenceQualityFixtures = {
  complete: {
    inventory: { known: 4, reconciled: 4, unresolved: 0 },
    attempts: { accepted: 4, rejected: 0, unstable: 0 },
    frames: { materialOpaque: 0 },
    temporal: { status: 'coherent' as const },
  },
  inventoryGap: {
    inventory: { known: 5, reconciled: 4, unresolved: 1 },
    gap: { targetKey: 'page:missing', reasonCode: 'known-unreconciled' },
  },
  failedAttempt: {
    attempt: {
      checkId: 'check:a',
      failureClass: 'scanner-timeout' as const,
      diagnosticCode: 'nav-timeout',
    },
  },
  unstableResult: {
    attempts: {
      checkId: 'check:a',
      materialDigests: ['result:a', 'result:b'],
      disposition: 'unstable-result' as const,
    },
  },
  opaqueMaterialFrame: {
    frame: {
      frameIdentity: 'frame:a',
      materiality: 'material' as const,
      sameOrigin: false,
      traversedCheckIds: [] as readonly string[],
      limitationReason: 'cross-origin-opaque' as const,
    },
  },
  temporalDrift: {
    temporal: {
      status: 'drift-detected' as const,
      materialTargets: ['page:a'],
      evidenceRefs: ['attempt:a', 'attempt:b'],
    },
  },
  /**
   * Plan 059 section 18, "Classification/pattern": one page per semantic
   * role the report-facing classifier must name, given the audit-profile
   * signals a scan.json persists. Signals are scheduling-side facts only;
   * no fixture stands in for a real scanned site.
   */
  semanticRoles: {
    transactional: {
      url: 'https://site-exemple.fr/reservation',
      signals: [{ kind: 'transactional-form', detail: '2 form(s)' }],
      expectedRole: 'transactional',
      expectedConfidence: 'high',
    },
    archive: {
      url: 'https://site-exemple.fr/blog',
      signals: [
        { kind: 'pagination-relation', detail: 'next' },
        { kind: 'repeated-teaser-links', detail: '9' },
      ],
      expectedRole: 'archive',
      expectedConfidence: 'high',
    },
    commercial: {
      url: 'https://site-exemple.fr/chambres',
      signals: [{ kind: 'content-json-ld-type', detail: 'Hotel' }],
      expectedRole: 'commercial',
      expectedConfidence: 'high',
    },
    legal: {
      url: 'https://site-exemple.fr/mentions-legales',
      signals: [],
      expectedRole: 'legal',
      expectedConfidence: 'medium',
    },
    unknown: {
      url: 'https://site-exemple.fr/a-propos',
      signals: [],
      expectedRole: 'unknown',
      expectedConfidence: 'low',
    },
    conflicting: {
      url: 'https://site-exemple.fr/blog/actu',
      signals: [
        { kind: 'numbered-pagination-control', detail: '3' },
        { kind: 'repeated-teaser-links', detail: '8' },
        { kind: 'content-json-ld-type', detail: 'Article' },
      ],
      expectedRole: 'conflicting',
      expectedConfidence: 'low',
    },
  },
  /**
   * Same rule, one stable selector component shared by many pages: the
   * shape pattern inference must collapse into one non-authoritative
   * pattern without touching the findings it points at.
   */
  sharedComponentDefect: {
    ruleId: 'image-alt',
    selector: 'img.card-visual',
    pages: ['https://site-exemple.fr/a', 'https://site-exemple.fr/b', 'https://site-exemple.fr/c'],
  },
  /** Two components whose selectors share a shape but not a component:
   *  evidence that must stay two patterns. */
  similarSelectorsDifferentComponents: {
    ruleId: 'link-name',
    first: { pageUrl: 'https://site-exemple.fr/a', selector: '.card .title a' },
    second: { pageUrl: 'https://site-exemple.fr/b', selector: '.panel .title a' },
  },
} as const;
