/**
 * What each accessibility check can and cannot prove (plan 059 section 5.16).
 *
 * A check that found nothing has proved nothing outside the part of the page
 * it could see. This registry states that part for every accessibility check
 * the scanner runs, so a report can say "no automated failure within this
 * capability" and never "compliant". It under-claims on purpose: a traversal
 * is marked only when it is proved, by `page-readiness.e2e.test.ts` for axe's
 * frame descent, and a custom check that reads `document` with
 * `querySelectorAll` is document-only, since that does not enter shadow roots
 * or frames.
 */
import {
  buildAccessibilityCapabilityRegistry,
  type AccessibilityCapabilityRegistry,
  type AccessibilityCheckCapability,
} from './evidence-surfaces.js';

const DOCUMENT_ONLY = {
  document: true,
  openShadowRoots: false,
  sameOriginFrames: false,
  crossOriginFrames: false,
} as const;

const BASELINE_DESKTOP = ['baseline-desktop'];

const CAPABILITIES: readonly AccessibilityCheckCapability[] = [
  {
    checkId: 'axe',
    version: 'axe-wcag22aa-v1',
    criterionRefs: ['wcag22-a', 'wcag22-aa'],
    evidenceKind: 'deterministic',
    proves:
      'Rule-level failures axe-core detects in the rendered DOM for the WCAG 2.2 A/AA tag set.',
    falseNegativeBoundary:
      'Criteria needing human judgement (meaning, sequence, sensory characteristics), states not reached by load, and any frame whose coverage record shows axe was not injected.',
    // axe-core pierces open shadow roots itself and @axe-core/playwright
    // descends into child frames of both origins. Descent can fail silently
    // per frame, so every frame's actual traversal is recorded separately.
    traversal: {
      document: true,
      openShadowRoots: true,
      sameOriginFrames: true,
      crossOriginFrames: true,
    },
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['closed-shadow-roots', 'dynamic-states', 'content-meaning', 'media-alternatives'],
  },
  {
    checkId: 'keyboard-navigation',
    version: 'keyboard-navigation-v1',
    criterionRefs: ['2.1.2', '2.4.3'],
    evidenceKind: 'deterministic',
    proves:
      'Focus traps and focus-order inversions met by sequential Tab navigation from page load.',
    falseNegativeBoundary:
      'Traps behind interactions the walk does not trigger, custom key handlers, and focus inside frames.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['custom-keyboard-shortcuts', 'focus-visible-quality'],
  },
  {
    checkId: 'form-error-handling',
    version: 'form-error-handling-v1',
    criterionRefs: ['3.3.1', '4.1.2'],
    evidenceKind: 'deterministic',
    proves:
      'Error messages shown on synthetic empty submission that are not programmatically associated with their field.',
    falseNegativeBoundary:
      'Server-side validation, multi-step forms, and forms inside frames or shadow roots.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['error-message-clarity', 'error-prevention'],
  },
  {
    checkId: 'placeholder-labels',
    version: 'placeholder-labels-v1',
    criterionRefs: ['3.3.2'],
    evidenceKind: 'deterministic',
    proves: 'Form fields whose only visible label is placeholder text.',
    falseNegativeBoundary: 'Fields inside frames or shadow roots.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['label-meaning'],
  },
  {
    checkId: 'video-captions',
    version: 'video-captions-v1',
    criterionRefs: ['1.2.2'],
    evidenceKind: 'deterministic',
    proves: 'Native video elements with no captions track.',
    falseNegativeBoundary:
      'Embedded third-party players, burned-in or player-side captions, and caption accuracy.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['caption-accuracy', 'audio-description'],
  },
  {
    checkId: 'alt-text',
    version: 'alt-text-quality-v1',
    criterionRefs: ['1.1.1'],
    evidenceKind: 'heuristic',
    proves: 'Alternative text shaped like a file name or placeholder; a signal, not a failure.',
    falseNegativeBoundary: 'Any alternative text that is well formed but wrong for its image.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['alt-text-meaning'],
  },
  {
    checkId: 'reflow',
    version: 'reflow-v1',
    criterionRefs: ['1.4.10'],
    evidenceKind: 'deterministic',
    proves: 'Horizontal scrolling at a 320 CSS pixel viewport width.',
    falseNegativeBoundary: 'Content lost or overlapping without causing horizontal scroll.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['content-loss-at-reflow', 'text-spacing'],
  },
  {
    checkId: 'html-validity',
    version: 'html-validity-v1',
    criterionRefs: [],
    evidenceKind: 'deterministic',
    proves: 'Structural HTML errors in the served document that can break assistive parsing.',
    falseNegativeBoundary: 'Errors introduced only by script after load.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: [],
  },
  {
    checkId: 'accessibility-statement',
    version: 'accessibility-statement-v1',
    criterionRefs: [],
    evidenceKind: 'deterministic',
    proves: 'Whether the site publishes a findable accessibility statement.',
    falseNegativeBoundary: 'A statement reachable only through search or an unlinked page.',
    traversal: DOCUMENT_ONLY,
    requiredInteractionStates: ['baseline'],
    requiredSurfaceProfiles: BASELINE_DESKTOP,
    manualGaps: ['statement-accuracy'],
  },
];

export const ACCESSIBILITY_CAPABILITY_REGISTRY: AccessibilityCapabilityRegistry =
  buildAccessibilityCapabilityRegistry({ checks: CAPABILITIES });
