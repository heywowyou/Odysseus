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

import type { StatSector } from '../reference-stats/types.js';

export interface Regime {
  id: string;
  name: string;
  thresholdDescription: string;
  authority: string;
  /** item 3.15: `authority` is deliberately kept as a single canonical
   *  string shared between French and English (regimes.ts's own
   *  documented convention - official body names are not translated).
   *  French grammar still needs "de la"/"du" in front of it ("sous le
   *  contrôle de la Direction générale...", "... du Défenseur des
   *  droits") - "de le" is not valid French, it contracts to "du" - which
   *  an undecorated shared string cannot carry without either
   *  duplicating `authority` per language or leaking a French
   *  preposition into the English report. Holds the full French
   *  preposition+article prefix to prepend before `authority`; English
   *  templates never read this field. */
  authorityPrefixFr: 'de la' | 'du';
  sanctionCeiling: string;
  legalCitation: string;
}

export interface TransactionalFlowEvidence {
  /** 'booking-engine-domain-reference' and 'booking-iframe' (item 0.1,
   *  La Corniche pass): a same-origin JS booking widget can reference its
   *  delegated engine's domain only inside an inline script/JSON config,
   *  never as a crawlable script[src] or a[href] - confirmed live against
   *  lacoorniche.com's Diadao HSC widget, whose "Réserver" button is
   *  `href="javascript:void(0)"` at load time. 'booking-iframe' covers the
   *  same gap for a booking/reservation widget embedded directly as a
   *  third-party iframe (confirmed against the same site's TheFork/
   *  LaFourchette restaurant-reservation modal iframes), which the
   *  detector previously never looked at. Both are on-site evidence, same
   *  as 'booking-engine-script', not delegated-redirect evidence. */
  kind:
    | 'booking-engine-script'
    | 'checkout-form'
    | 'payment-embed'
    | 'delegated-booking-redirect'
    | 'booking-engine-domain-reference'
    | 'booking-iframe';
  selector: string;
  pageUrl: string;
  /** Internal classification reasoning kept for defensibility, the same
   *  reason Finding.rawEvidence is kept - never render this directly in
   *  client-facing copy (item 0.2: it is internal English heuristic
   *  reasoning, not a client-facing fact). Use providerUrl below for the
   *  delegated booking provider's actual domain. */
  detail: string;
  /** kind 'delegated-booking-redirect' only: the resolved destination URL
   *  the redirect followed to. The report derives the provider's hostname
   *  from this, never from `detail`. */
  providerUrl?: string;
}

/**
 * A record of every outbound booking-intent link the detector followed
 * (or deliberately did not follow), whatever it concluded. Recorded
 * regardless of the resolution so a false negative like haaitza.com's
 * (delegated booking engine misread as no transactional flow) is visible
 * from siteSignals alone, not only from a manual site visit. Only
 * resolution 'single-property' also produces a matching
 * TransactionalFlowEvidence entry (kind 'delegated-booking-redirect');
 * 'marketplace' and 'undetermined' are evidence of what was checked, not
 * evidence of a transactional flow, so they never flip hasTransactionalFlow.
 */
export interface TransactionalFlowRedirectCheck {
  pageUrl: string;
  linkUrl: string;
  /** Absent when the link was recognized as a known OTA marketplace host
   *  and never followed, or when navigation failed outright. */
  destinationUrl?: string;
  resolution: 'single-property' | 'marketplace' | 'undetermined';
  detail: string;
}

export interface SiteSignals {
  hasTransactionalFlow: boolean;
  transactionalFlowEvidence: TransactionalFlowEvidence[];
  /** Optional for the same backward-compatibility reason other manifest
   *  fields are: absent for audits captured before this milestone. */
  transactionalFlowRedirectChecks?: TransactionalFlowRedirectCheck[];
}

/** Part B: a human-supplied fact about one boolean SiteSignals field,
 *  the same evidentiary role a manually supplied SIREN plays for
 *  profile.siren - it feeds in as an input, assessObligations still runs
 *  unchanged. Generic on purpose: this milestone's UI/CLI surface only
 *  exposes 'hasTransactionalFlow', but the next overridable signal should
 *  only need a new map key, not a new mechanism. */
export interface SiteSignalOverride {
  value: boolean;
  reason?: string;
}

export type SiteSignalOverrides = Record<string, SiteSignalOverride>;

/** How one boolean SiteSignals field was actually resolved, spliced onto
 *  ObligationAssessment by the caller (obligation-stage.ts) the same way
 *  sirenSource/sirenMismatch are - assessObligations itself has no notion
 *  of provenance, only of the value it was given. detectedValue is kept
 *  only when it disagrees with a manual override, purely so a detector
 *  that keeps missing the same pattern is visible in stored data, never
 *  to change the resolved value. */
export interface SiteSignalResolution {
  value: boolean;
  source: 'detected' | 'manual';
  reason?: string;
  detectedValue?: boolean;
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
  /** Keyed by SiteSignals boolean-field name, e.g. 'hasTransactionalFlow'.
   *  Same "never set by assessObligations itself" rule as sirenSource:
   *  spliced on by obligation-stage.ts once a value has been resolved
   *  from possibly two candidates (detected, manual). Absent entirely
   *  when siteSignals was never supplied at all. */
  siteSignalResolutions?: Record<string, SiteSignalResolution>;
  /** Coarse sector classification for report-side reference-stat
   *  selection (reference-stats/sector.ts's detectSector), spliced on by
   *  obligation-stage.ts from the same OperatorProfile.naf it already
   *  resolves - never set by assessObligations itself, same precedent as
   *  sirenSource. Storing the derived two-value sector rather than the
   *  raw NAF code is a deliberate data-minimisation choice, not an
   *  oversight. Absent for analyses generated before milestone 8.5c. */
  sector?: StatSector;
  /** item 0.1/1.11 (La Corniche pass): "report, don't conclude" requires
   *  printing every registry input the assessment relied on, not just
   *  the SIREN - denomination, effectifs bracket, when the record was
   *  retrieved, and its source. Spliced on by obligation-stage.ts from
   *  the same OperatorProfile a successful Sirene lookup already
   *  produced - never set by assessObligations itself, same precedent as
   *  sector/sirenMismatch. Absent when no Sirene lookup succeeded (no
   *  SIREN, or the lookup failed), matching sirenSource/sirenMismatch's
   *  own absence in that case. */
  registrySnapshot?: {
    denomination: string;
    effectifBandLabel: string | null;
    retrievedAt: Date;
    source: string;
  };
};
