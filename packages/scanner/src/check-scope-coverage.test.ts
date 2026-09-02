import { describe, expect, it } from 'vitest';
import {
  CHECK_SCOPE_REGISTRY,
  type CheckCompletionSignal,
  type CheckPass,
  type CheckScope,
} from './check-scope-coverage.js';

const VALID_SCOPES: readonly CheckScope[] = ['site', 'page', 'family', 'flow', 'resource'];
const VALID_PASSES: readonly CheckPass[] = ['rendered', 'axe', 'extended', 'lighthouse'];
const VALID_COMPLETION_SIGNALS: readonly CheckCompletionSignal[] = [
  'explicit-error-field',
  'best-effort-no-error-field',
  'conditional-attachment',
];

// The registry's own entry count, as an extra guard alongside the
// compile-time exhaustiveness assertion in check-scope-coverage.ts: a
// change to this number should always be a conscious edit to this test,
// not a silent side effect of adding a PageScanResult field.
const EXPECTED_ENTRY_COUNT = 22;

describe('CHECK_SCOPE_REGISTRY', () => {
  it('has the expected number of entries', () => {
    expect(CHECK_SCOPE_REGISTRY).toHaveLength(EXPECTED_ENTRY_COUNT);
  });

  it('gives every entry a non-empty id, applicability rule, valid scope and pass', () => {
    for (const entry of CHECK_SCOPE_REGISTRY) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.applicability.length).toBeGreaterThan(0);
      expect(VALID_SCOPES).toContain(entry.scope);
      expect(VALID_PASSES).toContain(entry.pass);
      expect(VALID_COMPLETION_SIGNALS).toContain(entry.completionSignal);
    }
  });

  it('uses unique ids', () => {
    const ids = CHECK_SCOPE_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps each PageScanResult field to exactly one entry', () => {
    const resultFields = CHECK_SCOPE_REGISTRY.map((e) => e.resultField);
    expect(new Set(resultFields).size).toBe(resultFields.length);
  });

  it('declares an error field only for an explicit-error-field entry, and vice versa', () => {
    for (const entry of CHECK_SCOPE_REGISTRY) {
      if (entry.completionSignal === 'explicit-error-field') {
        expect(entry.errorField).toBeDefined();
        expect(entry.errorField).toBe(`${entry.resultField}Error`);
      } else {
        expect(entry.errorField).toBeUndefined();
      }
    }
  });

  it('never assigns lighthouse to any pass other than lighthouse, or vice versa', () => {
    for (const entry of CHECK_SCOPE_REGISTRY) {
      if (entry.pass === 'lighthouse') {
        expect(entry.id).toBe('lighthouse');
      }
      if (entry.id === 'lighthouse') {
        expect(entry.pass).toBe('lighthouse');
      }
    }
  });

  it('only the lighthouse entry uses family scope in v1', () => {
    const familyScoped = CHECK_SCOPE_REGISTRY.filter((e) => e.scope === 'family');
    expect(familyScoped.map((e) => e.id)).toEqual(['lighthouse']);
  });
});
