/**
 * The obligation engine. Pure function: no network call, no LLM call, no
 * I/O of any kind, so it is fully unit-testable in isolation and callable
 * offline from a stored OperatorProfile (see acceptance criterion 9 -
 * calling with only a profile, no SiteSignals, must still resolve a
 * useful status for a future prospecting filter).
 *
 * siteSignals is optional on purpose. Omitted entirely: the SME
 * exemption test still runs (it only needs the profile), but the B2C
 * transactional-flow gate cannot be confirmed either way, so a
 * not-exempt profile resolves to 'likely_in_scope' rather than
 * 'in_scope'. Supplied: the gate is resolved definitively, either
 * 'in_scope' or 'out_of_scope' - except when the detector recorded
 * unresolved booking signals (issue #42), or when the only flow evidence
 * is checkout-form matches (issue #294: a form is not a transactional
 * flow), both of which resolve to 'likely_in_scope' with a
 * distinguishing fact kind rather than dressing an unresolved detection
 * up as a clean negative or a confirmed flow.
 *
 * An OperatorProfile built from a stock import may have no turnover field,
 * unlike the live Sirene API. The exemption check degrades conservatively
 * when that fact is unavailable: it never invents an exemption, and report
 * or outreach text must still say "not confirmed exempt," never "obligated,"
 * per the report-not-conclude rule (CLAUDE.md).
 */

import type { OperatorProfile } from '../types/entity.js';
import type {
  ObligationAssessment,
  ObligationBasis,
  ObligationBasisFact,
  SiteSignals,
} from '../types/compliance.js';
import {
  ARTICLE_47_REGIME_ID,
  ARTICLE_47_TURNOVER_THRESHOLD_EUR,
  EAA_REGIME_ID,
  SME_EXEMPTION_TURNOVER_THRESHOLD_EUR,
} from './regimes.js';

/** INSEE tranche_effectif_salarie codes for which the SME exemption's
 *  headcount leg can hold. Any band outside this set (10 salaries or
 *  more) fails the exemption on headcount alone, and turnover is never
 *  even inspected - "turnover irrelevant once headcount clears". */
const SME_EXEMPT_EFFECTIF_CODES = new Set(['00', '01', '02', '03', 'NN']);

function knownSireneFailureReason(
  source: string,
): 'not-found' | 'api-unreachable' | 'etablissement-fermee' {
  const prefix = 'sirene-lookup:';
  if (source.startsWith(prefix)) {
    const reason = source.slice(prefix.length);
    if (reason === 'not-found' || reason === 'api-unreachable' || reason === 'etablissement-fermee')
      return reason;
  }
  return 'api-unreachable';
}

/** Issue #42: how many booking signals the detector found but could not
 *  resolve, from the two places it records them - booking-intent controls
 *  with no crawlable destination (transactionalFlowAmbiguities), and
 *  followed booking links whose destination page classified as
 *  'undetermined'. Both mean hasTransactionalFlow=false is an unresolved
 *  detection, not a clean negative; 'marketplace' resolutions are a
 *  confirmed negative for their links and deliberately do not count. */
function transactionalFlowAmbiguityCount(siteSignals: SiteSignals): number {
  const undeterminedRedirectChecks = (siteSignals.transactionalFlowRedirectChecks ?? []).filter(
    (check) => check.resolution === 'undetermined',
  ).length;
  return (siteSignals.transactionalFlowAmbiguities ?? []).length + undeterminedRedirectChecks;
}

/** Neither the EAA gate nor article 47 can be evaluated without a
 *  resolved effectif band - this is the "insufficient data" boundary,
 *  distinct from a definitively resolved exemption or scope. */
function undeterminedFact(profile: OperatorProfile): ObligationBasisFact | null {
  if (profile.siren.value === '') return { kind: 'siren-missing' };
  if (profile.effectifBand.value === null) {
    return {
      kind: 'sirene-lookup-failed',
      reason: knownSireneFailureReason(profile.effectifBand.source),
    };
  }
  return null;
}

function checkSmeExemption(profile: OperatorProfile): {
  exempt: boolean;
  /** The exemption could hold, but the data needed to decide is missing. */
  undetermined?: true;
  fact: ObligationBasisFact;
} {
  const band = profile.effectifBand.value;
  if (!band) throw new Error('checkSmeExemption requires a resolved effectif band');

  if (!SME_EXEMPT_EFFECTIF_CODES.has(band.code)) {
    return { exempt: false, fact: { kind: 'effectif-band', code: band.code, label: band.label } };
  }

  const turnover = profile.turnover.value;
  // Issue #78: a strictly-positive requirement, not just non-null. The
  // adapter boundary (sirene-client.ts's latestTurnover) is now the one
  // place that maps the registry's own missing-value sentinel to null, but
  // this guard is belt and braces so a future adapter for a different
  // turnover source cannot reintroduce the same bypass by returning 0
  // instead of null for "no data".
  if (turnover === null || turnover <= 0) {
    // Low enough band that the exemption could apply, but turnover is
    // unknown: no exemption is claimed without positive evidence.
    return { exempt: false, fact: { kind: 'effectif-band', code: band.code, label: band.label } };
  }

  // "n'excède pas deux millions d'euros": exactly EUR 2M is still exempt.
  if (turnover <= SME_EXEMPTION_TURNOVER_THRESHOLD_EUR) {
    return {
      exempt: true,
      fact: { kind: 'sme-exemption', effectifCode: band.code, turnoverEur: turnover },
    };
  }

  // The exemption holds while turnover OR the balance sheet total stays at
  // or below EUR 2M (art. L412-13 code de la consommation). Turnover above
  // it rules nothing out without the balance sheet, which no source here
  // provides.
  return {
    exempt: false,
    undetermined: true,
    fact: {
      kind: 'sme-balance-sheet-unknown',
      effectifCode: band.code,
      turnoverEur: turnover,
      thresholdEur: SME_EXEMPTION_TURNOVER_THRESHOLD_EUR,
    },
  };
}

export function assessObligations(
  profile: OperatorProfile,
  siteSignals?: SiteSignals,
): ObligationAssessment {
  const undetermined = undeterminedFact(profile);
  if (undetermined) {
    return { status: 'undetermined', basis: [{ regimeId: EAA_REGIME_ID, facts: [undetermined] }] };
  }

  const {
    exempt,
    undetermined: exemptionUndetermined,
    fact: exemptionFact,
  } = checkSmeExemption(profile);
  const eaaFacts: ObligationBasisFact[] = [exemptionFact];

  // Issue #294 (haaitza.com): 'checkout-form' evidence alone is a form
  // element, not a booking, cart or payment flow - the report named
  // Gravity Forms, a contact-form plugin, as the site's "booking engine"
  // on exactly this signal. A form alone does not establish that a
  // contract can be concluded online, so a form-only detection resolves
  // to the established "could not be confirmed" status with its own fact
  // kind, never to a flow assertion. Evidence kinds that name a real
  // engine (payment scripts, booking engines, confirmed redirects,
  // booking iframes) keep asserting the flow, and so does an operator
  // override with no recorded evidence: their word is the resolution.
  const flowEvidence = siteSignals?.transactionalFlowEvidence ?? [];
  const hasEngineEvidence = flowEvidence.some((e) => e.kind !== 'checkout-form');
  const hasFormOnlyEvidence = !hasEngineEvidence && flowEvidence.length > 0;

  let eaaStatus: 'in_scope' | 'likely_in_scope' | 'out_of_scope' | 'undetermined';
  if (exempt) {
    eaaStatus = 'out_of_scope';
  } else if (siteSignals === undefined) {
    eaaStatus = 'likely_in_scope';
    eaaFacts.push({ kind: 'transactional-flow-unknown' });
  } else if (siteSignals.hasTransactionalFlow && hasEngineEvidence) {
    eaaStatus = 'in_scope';
    eaaFacts.push({ kind: 'transactional-flow', evidence: siteSignals.transactionalFlowEvidence });
  } else if (siteSignals.hasTransactionalFlow && hasFormOnlyEvidence) {
    eaaStatus = 'likely_in_scope';
    eaaFacts.push({ kind: 'transactional-flow-form-only' });
  } else if (siteSignals.hasTransactionalFlow) {
    eaaStatus = 'in_scope';
    eaaFacts.push({ kind: 'transactional-flow', evidence: siteSignals.transactionalFlowEvidence });
  } else if (transactionalFlowAmbiguityCount(siteSignals) > 0) {
    // Issue #42: the detector ran and left booking signals it could not
    // resolve. That is not a clean negative - resolving out_of_scope here
    // is exactly how Villas Foch's no-href booking controls silently
    // withheld the EAA reference from a client who does take bookings.
    // 'likely_in_scope' is the established status for "the flow gate
    // could not be confirmed either way"; the fact kind keeps the two
    // routes to it distinguishable in stored basis data.
    eaaStatus = 'likely_in_scope';
    eaaFacts.push({ kind: 'transactional-flow-inconclusive' });
  } else {
    eaaStatus = 'out_of_scope';
    eaaFacts.push({ kind: 'no-transactional-flow' });
  }
  // A flow keeps the question open only while the exemption might still
  // hold; with no flow the regime is out of scope either way.
  if (exemptionUndetermined === true && eaaStatus !== 'out_of_scope') {
    eaaStatus = 'undetermined';
  }

  const basis: ObligationBasis[] = [{ regimeId: EAA_REGIME_ID, facts: eaaFacts }];

  // Independent of the EAA result entirely: a large turnover triggers
  // article 47 whether or not the site runs a transactional flow. Can
  // upgrade the merged status to in_scope; never downgrades an EAA
  // in_scope result (the formula below simply never picks eaaStatus over
  // 'in_scope' when article47Triggers is true).
  const turnover = profile.turnover.value;
  const article47Triggers = turnover !== null && turnover > ARTICLE_47_TURNOVER_THRESHOLD_EUR;
  if (article47Triggers && turnover !== null) {
    basis.push({
      regimeId: ARTICLE_47_REGIME_ID,
      facts: [
        { kind: 'turnover', amountEur: turnover, thresholdEur: ARTICLE_47_TURNOVER_THRESHOLD_EUR },
      ],
    });
  }

  const status = article47Triggers ? 'in_scope' : eaaStatus;
  return { status, basis };
}
