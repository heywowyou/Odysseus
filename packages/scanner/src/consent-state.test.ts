import { describe, expect, it } from 'vitest';
import {
  isStructurallySafeControl,
  observeConsentBaseline,
  planLocalStateControls,
  selectSafeConsentRejection,
  stateControlKey,
  type StateControlCandidate,
} from './consent-state.js';

const rejectButton = (overrides: Partial<StateControlCandidate> = {}): StateControlCandidate => ({
  selector: '#cmp .cmp-reject-all',
  tag: 'button',
  role: null,
  type: 'button',
  identityTokens: ['cmp', 'cmp-reject-all'],
  insideForm: false,
  isNavigation: false,
  controlsId: null,
  ...overrides,
});

describe('selectSafeConsentRejection', () => {
  it('selects the one deterministic reject control of a known CMP pattern', () => {
    const decision = selectSafeConsentRejection([
      rejectButton(),
      {
        selector: '#cmp .cmp-accept-all',
        tag: 'button',
        role: null,
        type: 'button',
        identityTokens: ['cmp', 'cmp-accept-all'],
        insideForm: false,
        isNavigation: false,
        controlsId: null,
      },
    ]);

    expect(decision).toMatchObject({
      kind: 'safe-reject',
      selector: '#cmp .cmp-reject-all',
      matchedPattern: 'cmp-reject-all',
    });
  });

  it('never guesses from visitor-facing text: a text-only reject is not a match', () => {
    // The element's identity tokens carry no CMP pattern; only its visible
    // label would say "refuser", and labels are never extracted.
    const decision = selectSafeConsentRejection([
      {
        selector: 'main button:nth-of-type(2)',
        tag: 'button',
        role: null,
        type: 'button',
        identityTokens: ['btn-2'],
        insideForm: false,
        isNavigation: false,
        controlsId: null,
      },
    ]);

    expect(decision.kind).toBe('no-banner');
  });

  it('refuses an accept/continue control even on a known CMP container', () => {
    const decision = selectSafeConsentRejection([
      {
        selector: '#cmp .cmp-accept-all',
        tag: 'button',
        role: null,
        type: 'button',
        identityTokens: ['cmp', 'cmp-accept-all'],
        insideForm: false,
        isNavigation: false,
        controlsId: null,
      },
    ]);

    expect(decision.kind).toBe('no-banner');
  });

  it('refuses to guess between two matching CMP controls', () => {
    const decision = selectSafeConsentRejection([
      rejectButton(),
      {
        selector: '#onetrust .onetrust-reject-all-handler',
        tag: 'button',
        role: null,
        type: 'button',
        identityTokens: ['onetrust', 'onetrust-reject-all-handler'],
        insideForm: false,
        isNavigation: false,
        controlsId: null,
      },
    ]);

    expect(decision).toMatchObject({ kind: 'ambiguous' });
  });

  it('refuses an unsafe reject control instead of clicking it', () => {
    const inForm = selectSafeConsentRejection([rejectButton({ insideForm: true })]);
    expect(inForm.kind).toBe('unsafe');

    const asLink = selectSafeConsentRejection([rejectButton({ tag: 'a', isNavigation: true })]);
    expect(asLink.kind).toBe('unsafe');

    const asSubmit = selectSafeConsentRejection([rejectButton({ tag: 'input', type: 'submit' })]);
    expect(asSubmit.kind).toBe('unsafe');
  });

  it('never calls a form-nested or navigation control structurally safe', () => {
    expect(isStructurallySafeControl(rejectButton({ insideForm: true }))).toMatch(/form/);
    expect(isStructurallySafeControl(rejectButton({ isNavigation: true }))).toMatch(/navigates/);
    expect(isStructurallySafeControl(rejectButton({ type: 'submit' }))).toMatch(/submit/);
    expect(isStructurallySafeControl(rejectButton())).toBeNull();
  });
});

describe('observeConsentBaseline', () => {
  it('records the delivered overlay state without page text', () => {
    const detected = observeConsentBaseline([rejectButton()], '#cmp');
    expect(detected).toEqual({
      state: 'consent-controls-detected',
      controlCount: 1,
      containerRef: '#cmp',
    });

    const absent = observeConsentBaseline([]);
    expect(absent.state).toBe('no-consent-controls');
    expect(absent.controlCount).toBe(0);
  });
});

describe('planLocalStateControls', () => {
  const details = (nth: number): StateControlCandidate => ({
    selector: `main details:nth-of-type(${nth})`,
    tag: 'details',
    role: null,
    type: null,
    identityTokens: [],
    insideForm: false,
    isNavigation: false,
    controlsId: null,
  });
  const disclosure = (nth: number): StateControlCandidate => ({
    selector: `main button:nth-of-type(${nth})`,
    tag: 'button',
    role: 'button',
    type: 'button',
    identityTokens: [`disclosure-${nth}`],
    insideForm: false,
    isNavigation: false,
    controlsId: `panel-${nth}`,
  });

  it('plans only provably same-document, non-submitting toggles', () => {
    const plans = planLocalStateControls(
      [
        details(1),
        disclosure(1),
        disclosure(2),
        // Unsafe shapes are left alone.
        { ...disclosure(3), insideForm: true },
        { ...disclosure(4), tag: 'a', isNavigation: true },
        // aria-controls naming a missing element never reaches the plan
        // (the runner drops it before planning).
        { ...disclosure(5), controlsId: null },
      ],
      8,
    );

    expect(plans).toEqual([
      { kind: 'details', selector: 'main details:nth-of-type(1)', controlKey: expect.any(String) },
      {
        kind: 'aria-controls',
        selector: 'main button:nth-of-type(1)',
        controlKey: expect.any(String),
        controlsId: 'panel-1',
      },
      {
        kind: 'aria-controls',
        selector: 'main button:nth-of-type(2)',
        controlKey: expect.any(String),
        controlsId: 'panel-2',
      },
    ]);
  });

  it('is bounded by the per-page budget', () => {
    const many = Array.from({ length: 12 }, (_, index) => details(index + 1));
    const plans = planLocalStateControls(many, 8);

    expect(plans).toHaveLength(8);
  });

  it('keys controls by selector digest, never by page text', () => {
    const key = stateControlKey('main details:nth-of-type(1)');
    expect(key).toMatch(/^control:[0-9a-f]+$/);
    expect(key).toBe(stateControlKey('main details:nth-of-type(1)'));
  });
});
