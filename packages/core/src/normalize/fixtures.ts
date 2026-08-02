/**
 * Test-only builder helpers for normalize fixtures. Named without
 * .test.ts/.spec.ts so Vitest's glob (packages/**\/*.{test,spec}.ts)
 * does not pick this up as a suite.
 */

import type { AxeNodeInput, AxeResultsInput, AxeViolationInput } from './normalize-axe.js';
import type {
  LighthouseAuditInput,
  LighthouseAuditRefInput,
  LighthouseCategoryInput,
  LighthouseResultInput,
} from './normalize-lighthouse.js';
import type { RenderDiffResult } from '../types/findings.js';
import type { NormalizePageInput } from './normalize.js';

export function buildAxeNode(overrides: Partial<AxeNodeInput> = {}): AxeNodeInput {
  return {
    html: '<input placeholder="Email">',
    target: ['#email-input'],
    impact: 'serious',
    ...overrides,
  };
}

export function buildAxeViolation(overrides: Partial<AxeViolationInput> = {}): AxeViolationInput {
  return {
    id: 'color-contrast',
    impact: 'serious',
    tags: ['wcag2aa', 'wcag143'],
    help: 'Elements must meet minimum color contrast ratio thresholds',
    description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/color-contrast',
    nodes: [buildAxeNode()],
    ...overrides,
  };
}

export function buildAxeResultsInput(
  violations: AxeViolationInput[] = [buildAxeViolation()],
): AxeResultsInput {
  return { violations };
}

export function buildLighthouseAudit(overrides: Partial<LighthouseAuditInput> = {}): LighthouseAuditInput {
  return {
    score: 0.3,
    scoreDisplayMode: 'numeric',
    title: 'Largest Contentful Paint',
    description: 'Largest Contentful Paint marks the time at which the largest text or image is painted.',
    ...overrides,
  };
}

export function buildLighthouseCategory(
  overrides: Partial<LighthouseCategoryInput> = {},
): LighthouseCategoryInput {
  return {
    score: 0.4,
    auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }],
    ...overrides,
  };
}

export function buildLighthouseResultInput(
  overrides: Partial<{
    categories: Record<string, LighthouseCategoryInput>;
    audits: Record<string, LighthouseAuditInput>;
  }> = {},
): LighthouseResultInput {
  // Deliberately not merged with a default category/audit set: a caller
  // supplying `categories` almost always wants to isolate exactly those
  // categories (e.g. "assert nothing is emitted from accessibility"), and
  // silently keeping unrelated default categories/audits around would
  // make such isolation tests wrong in a hard-to-notice way.
  return {
    categories: overrides.categories ?? {
      performance: buildLighthouseCategory(),
      seo: { score: 0.9, auditRefs: [] },
      accessibility: { score: 0.85, auditRefs: [] },
      'best-practices': { score: 0.95, auditRefs: [] },
    },
    audits: overrides.audits ?? {
      'largest-contentful-paint': buildLighthouseAudit(),
    },
  };
}

export function buildLighthouseAuditRef(
  overrides: Partial<LighthouseAuditRefInput> = {},
): LighthouseAuditRefInput {
  return { id: 'largest-contentful-paint', weight: 25, ...overrides };
}

export function buildRenderDiffResult(overrides: Partial<RenderDiffResult> = {}): RenderDiffResult {
  return {
    pageUrl: 'https://example.com/',
    rawTextLength: 10,
    renderedTextLength: 1000,
    missingPercent: 99,
    consoleErrors: [],
    httpStatus: 200,
    ...overrides,
  };
}

export function buildNormalizePageInput(overrides: Partial<NormalizePageInput> = {}): NormalizePageInput {
  return {
    url: 'https://example.com/',
    ...overrides,
  };
}
