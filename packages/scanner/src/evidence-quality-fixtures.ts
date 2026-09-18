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
} as const;

export type EvidenceQualityFixtureName = keyof typeof evidenceQualityFixtures;
