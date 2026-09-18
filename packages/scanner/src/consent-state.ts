/**
 * Deterministic consent and local-state control selection (plan 059
 * sections 3.5, 9 and 14: "Consent state", "Safe local state exploration",
 * "Side-effect guard").
 *
 * The rule that shapes everything here: the scanner never guesses from
 * visible text, never auto-accepts marketing consent, and never interacts
 * with a control it cannot prove is same-document and non-submitting. What
 * it may do is click one provably-safe reject/dismiss control of a known
 * consent-management pattern, and toggle provably same-document disclosure
 * controls, in a fresh storage context, with every transition recorded.
 *
 * The selection is pure: it decides from an attribute-level summary the
 * runner extracts from the DOM, so both the safety rules and their refusal
 * reasons are unit-testable without a browser. A refusal is a result, not
 * an error — the runner records it as a surface limitation instead of
 * clicking.
 */
import { canonicalDigest } from '@odysseus/core';

/** A consent overlay state as delivered, recorded on every page's
 *  baseline evidence (section 9: baseline captures the banner as
 *  delivered). */
export type ConsentBaselineState =
  'consent-controls-detected' | 'no-consent-controls' | 'undetermined';

export interface ConsentBaselineObservation {
  state: ConsentBaselineState;
  /** Bounded, attribute-level identities of what was seen; no page text. */
  controlCount: number;
  containerRef?: string;
}

/** One interactive element summarized from the DOM. Attribute-level and
 *  bounded: identity comes from element attributes, never from the words
 *  shown to a visitor. */
export interface StateControlCandidate {
  /** A CSS selector resolving to exactly this element in the live DOM. */
  selector: string;
  tag: 'button' | 'input' | 'a' | 'details' | 'other';
  role: string | null;
  type: string | null;
  /** Identity-bearing attributes (id/class/name/data-*), lowercased,
   *  bounded. This is what the deterministic table matches against. */
  identityTokens: string[];
  /** True when the element sits inside a <form>: a click can trigger a
   *  submission path we cannot prove safe, so it is never a candidate. */
  insideForm: boolean;
  /** True when the element is an anchor with an href: navigation, never
   *  safe to click for state change. */
  isNavigation: boolean;
  /** For aria-controls candidates: the id of the element the control
   *  discloses, verified to exist in the same document. */
  controlsId: string | null;
  /** Element identity used in records: a digest of the selector, not page
   *  content. */
  key?: string;
}

export interface ConsentRejectPlan {
  kind: 'safe-reject';
  selector: string;
  controlKey: string;
  /** Which deterministic pattern matched, for the surface record. */
  matchedPattern: string;
}

export type ConsentRejectionDecision =
  | ConsentRejectPlan
  | { kind: 'no-banner' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'unsafe'; reason: string };

/**
 * Deterministic reject/dismiss patterns of the consent-management platforms
 * Odysseus actually encounters, keyed on element identity (id/class/data
 * attributes), never on label text. Every pattern names a control whose
 * documented meaning is rejection, dismissal or closing the banner — an
 * accept/continue control can never match.
 */
/** Each pattern is tested against every identity token individually
 *  (tokens are lowercase, separators preserved), so `cmp-reject-all`,
 *  `rejectAll`-style ids and `onetrust-reject-all-handler` all match while
 *  arbitrary button labels never can. */
const CONSENT_REJECT_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /(^|[-_])all[-_]?rejected?($|[-_])/i, label: 'cmp-all-rejected' },
  { pattern: /(^|[-_])reject[-_]?all($|[-_])/i, label: 'cmp-reject-all' },
  { pattern: /(^|[-_])deny[-_]?all($|[-_])/i, label: 'cmp-deny-all' },
  { pattern: /(^|[-_])refus(er)?[-_]?tout($|[-_])/i, label: 'cmp-refuser-tout' },
  { pattern: /continue[-_]?without[-_]?accepting/i, label: 'cmp-continue-without' },
  { pattern: /^tarteaucitronallrejected$/i, label: 'tarteaucitron-all-rejected' },
  { pattern: /^axeptio[-_]?btn[-_]?(deny|dismiss)$/i, label: 'axeptio-deny' },
  { pattern: /(banner[-_]?)?reject[-_]?button($|[-_])/i, label: 'cmp-reject-button' },
];

function identityOf(candidate: StateControlCandidate): string[] {
  return candidate.identityTokens;
}

function matchesAnyToken(tokens: readonly string[], pattern: RegExp): boolean {
  return tokens.some((token) => pattern.test(token));
}

/** Structural safety rules every scanner-initiated click must satisfy
 *  (section 9, side-effect guard): not a navigation, not inside a form,
 *  and explicitly a non-submitting button. */
export function isStructurallySafeControl(candidate: StateControlCandidate): string | null {
  if (candidate.isNavigation) {
    return 'control is a link: clicking it navigates, which the scanner never does for state';
  }
  if (candidate.insideForm) {
    return 'control sits inside a form: a click could take a submission path, which the scanner never risks';
  }
  if (candidate.tag === 'input' && candidate.type !== null && candidate.type !== 'button') {
    return `control is an input of type ${candidate.type}: only type=button is provably non-submitting`;
  }
  if (candidate.tag === 'button' && candidate.type !== null && candidate.type === 'submit') {
    return 'control is a submit button';
  }
  return null;
}

/** Control key used in transition records: a digest of the selector, so no
 *  page-derived text is stored. */
export function stateControlKey(selector: string): string {
  return `control:${canonicalDigest(selector).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/**
 * Decides whether the page offers a provably safe reject/dismiss control.
 * Exactly one candidate must match exactly one deterministic pattern and
 * pass the structural safety rules; anything more or less than that is a
 * refusal, and a refusal is recorded rather than guessed away.
 */
export function selectSafeConsentRejection(
  candidates: readonly StateControlCandidate[],
): ConsentRejectionDecision {
  const matched: { candidate: StateControlCandidate; label: string }[] = [];
  for (const candidate of candidates) {
    const identity = identityOf(candidate);
    for (const { pattern, label } of CONSENT_REJECT_PATTERNS) {
      if (!matchesAnyToken(identity, pattern)) continue;
      const unsafe = isStructurallySafeControl(candidate);
      if (unsafe !== null) return { kind: 'unsafe', reason: `${label}: ${unsafe}` };
      matched.push({ candidate, label });
      break;
    }
  }
  if (matched.length === 0) return { kind: 'no-banner' };
  if (matched.length > 1) {
    const labels = [...new Set(matched.map((entry) => entry.label))].sort().join(', ');
    return {
      kind: 'ambiguous',
      reason: `${matched.length} consent controls matched (${labels}); the scanner never guesses between them`,
    };
  }
  const { candidate, label } = matched[0]!;
  return {
    kind: 'safe-reject',
    selector: candidate.selector,
    controlKey: stateControlKey(candidate.selector),
    matchedPattern: label,
  };
}

/** The baseline record: what the page delivered, before any interaction. */
export function observeConsentBaseline(
  candidates: readonly StateControlCandidate[],
  containerRef?: string,
): ConsentBaselineObservation {
  return {
    state: candidates.length > 0 ? 'consent-controls-detected' : 'no-consent-controls',
    controlCount: candidates.length,
    ...(containerRef !== undefined ? { containerRef } : {}),
  };
}

export interface LocalStatePlan {
  kind: 'details';
  selector: string;
  controlKey: string;
}

export type LocalStateControlPlan =
  | LocalStatePlan
  | { kind: 'aria-controls'; selector: string; controlKey: string; controlsId: string };

/**
 * Plans the same-document disclosure toggles one page offers, bounded per
 * page (section 9: "Bounded per-page budget"). Only two shapes qualify:
 * closed <details> elements (the platform's own same-document toggle) and
 * non-submitting buttons whose aria-controls names an element that exists
 * in the same document. Anything else — links, form controls, buttons
 * without a resolvable disclosure target — is left alone.
 */
export function planLocalStateControls(
  candidates: readonly StateControlCandidate[],
  budget: number,
): LocalStateControlPlan[] {
  const plans: LocalStateControlPlan[] = [];
  for (const candidate of candidates) {
    if (plans.length >= budget) break;
    if (isStructurallySafeControl(candidate) !== null) continue;
    if (candidate.tag === 'details') {
      plans.push({
        kind: 'details',
        selector: candidate.selector,
        controlKey: stateControlKey(candidate.selector),
      });
      continue;
    }
    if (candidate.controlsId !== null) {
      plans.push({
        kind: 'aria-controls',
        selector: candidate.selector,
        controlKey: stateControlKey(candidate.selector),
        controlsId: candidate.controlsId,
      });
    }
  }
  return plans;
}

/** A recorded state transition (section 9: "state transition recorded"). */
export interface LocalStateTransitionRecord {
  kind: 'details' | 'aria-controls';
  controlKey: string;
  selector: string;
  before: 'closed' | 'open' | 'unknown';
  after: 'closed' | 'open' | 'unknown';
  /** True when the side-effect guard stopped the interaction: the toggle
   *  navigated or otherwise left the same document. */
  abortedBySideEffectGuard?: boolean;
  guardReason?: string;
}

/** Client-facing statement for a consent overlay the scanner could see but
 *  could not provably safely reject or dismiss. A refusal is recorded, not
 *  guessed away (section 3.5). */
export const CONSENT_INTERACTION_AMBIGUOUS = {
  code: 'consent-interaction-ambiguous',
  fr: "Un bandeau de consentement est présent mais le bouton de refus ne peut pas être identifié de manière sûre : la page n'a pas été analysée au-delà de cet état.",
  en: 'A consent banner is present but its reject button cannot be identified safely: the page was not analysed beyond that state.',
} as const;

export const CONSENT_INTERACTION_UNSAFE = {
  code: 'consent-interaction-unsafe',
  fr: "Un bandeau de consentement est présent mais son interaction présente un risque de soumission : la page n'a pas été analysée au-delà de cet état.",
  en: 'A consent banner is present but interacting with it could take a submission path: the page was not analysed beyond that state.',
} as const;

/** Statement for a consent surface whose safe rejection was established
 *  but did not dismiss the banner (a guard abort or a failed click). */
export const CONSENT_SURFACE_INEFFECTIVE = {
  code: 'consent-surface-ineffective',
  fr: "Le refus du bandeau de consentement d'une page n'a pas abouti : la page n'a pas été analysée au-delà de cet état.",
  en: "One page's consent rejection did not take effect: the page was not analysed beyond that state.",
} as const;

/** Statement for a consent surface that could not run at all. */
export const CONSENT_SURFACE_UNAVAILABLE = {
  code: 'consent-surface-unavailable',
  fr: "La surface consentement d'une page n'a pas pu être analysée : l'état livré par le site reste celui qui a été vérifié.",
  en: "One page's consent surface could not be analysed: the delivered state remains the verified one.",
} as const;
