/**
 * The obligation engine's output shapes. assessObligations
 * (compliance/assessObligations.ts) is a pure function of OperatorProfile
 * plus an optional SiteSignals; it is the only thing allowed to decide an
 * ObligationAssessment, per CLAUDE.md's governing rule that deterministic
 * logic decides and the LLM never does. The LLM does not consume this
 * milestone's output at all: the report renders it directly from code,
 * the same way legalRelevance is built in packages/llm/src/legal-
 * relevance.ts and attached outside any model-writable schema field.
 */

export interface Regime {
  id: string;
  name: string;
  thresholdDescription: string;
  authority: string;
  sanctionCeiling: string;
  legalCitation: string;
}

export interface TransactionalFlowEvidence {
  kind: 'booking-engine-script' | 'checkout-form' | 'payment-embed';
  selector: string;
  pageUrl: string;
  /** e.g. the matched script src, form action, or provider domain. Kept
   *  for the same defensibility reason Finding.rawEvidence is kept. */
  detail: string;
}

export interface SiteSignals {
  hasTransactionalFlow: boolean;
  transactionalFlowEvidence: TransactionalFlowEvidence[];
}

export type ObligationBasisFact =
  | { kind: 'effectif-band'; code: string; label: string }
  | { kind: 'turnover'; amountEur: number; thresholdEur: number }
  | { kind: 'sme-exemption'; effectifCode: string; turnoverEur: number }
  | { kind: 'transactional-flow'; evidence: TransactionalFlowEvidence[] }
  | { kind: 'no-transactional-flow' }
  | { kind: 'transactional-flow-unknown' }
  | { kind: 'siren-missing' }
  | { kind: 'sirene-lookup-failed'; reason: 'not-found' | 'api-unreachable' | 'etablissement-fermee' };

export interface ObligationBasis {
  regimeId: string;
  facts: ObligationBasisFact[];
}

/** Both numbers recorded, no editorializing about which is "correct" -
 *  see packages/interface's obligation-stage.ts and the manual-SIREN
 *  milestone's design constraints. A mismatch matters more than almost
 *  anything else in this chapter: it can mean the site is operated by a
 *  different legal entity than the one being audited. */
export interface SirenMismatch {
  extractedSiren: string;
  manualSiren: string;
}

/**
 * likely_in_scope is the prospecting-filter result: assessObligations was
 * called with only a profile (no SiteSignals), so the SME exemption test
 * ran but the B2C transactional-flow gate could not be confirmed either
 * way. undetermined means the exemption test itself could not run at all
 * (no SIREN, or a failed Sirene lookup) - a stronger form of "don't know"
 * than likely_in_scope.
 *
 * sirenSource/sirenMismatch are never set by assessObligations itself -
 * that function has no notion of where a SIREN came from, only whether
 * the profile it was given resolves. They are spliced onto the result by
 * the caller (packages/interface's obligation-stage.ts) once a SIREN has
 * been chosen from possibly two candidates (extracted, manual). Absent
 * entirely when no SIREN was ever available to resolve.
 */
export type ObligationAssessment = (
  | { status: 'in_scope'; basis: ObligationBasis[] }
  | { status: 'likely_in_scope'; basis: ObligationBasis[] }
  | { status: 'out_of_scope'; basis: ObligationBasis[] }
  | { status: 'undetermined'; basis: ObligationBasis[] }
) & {
  sirenSource?: 'extracted' | 'manual';
  sirenMismatch?: SirenMismatch;
};
