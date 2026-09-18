import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeFindingsDelta,
  type DeltaFinding,
  type FindingsDelta,
  type FindingsDeltaRun,
  type ReportLanguage,
} from '@odysseus/core';
import { renderFindingsDelta } from './findings-delta.js';
import { renderHtml } from '../render-html.js';
import { getStrings } from '../strings/i18n.js';
import { resolveRenderDiffEvidence } from '../../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

/**
 * Plan 051 closure contract for the report side of the findings delta:
 * committed FR/EN golden output for every closed delta state, structural
 * FR/EN parity, no-baseline neutrality, and zero model calls while a
 * re-audit report renders.
 */

/** Every @odysseus/llm export that reaches the model provider (the model
 *  calls and the provider configuration readers) is replaced by a spy that
 *  records the call and throws. Deterministic helpers stay real. */
const modelEntryCalls = vi.hoisted(() => [] as string[]);
vi.mock('@odysseus/llm', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const wrapped: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value === 'function' && /^call|OpenAi|^ensureEnvLoaded$/.test(name)) {
      wrapped[name] = (..._args: unknown[]) => {
        modelEntryCalls.push(name);
        throw new Error(`model entry ${name} called while rendering a findings delta`);
      };
    }
  }
  return wrapped;
});

function finding(
  key: string,
  severity: DeltaFinding['severity'],
  ruleId = 'image-alt',
): DeltaFinding {
  return {
    findingId: `f-${key}`,
    ruleId,
    category: 'accessibility',
    severity,
    title: `Scanner title ${key}`,
    pageUrls: ['https://hotel.fr/', 'https://hotel.fr/rooms'],
    dedupeKey: key,
  };
}

function run(
  auditId: string,
  findings: readonly DeltaFinding[],
  overrides: Partial<FindingsDeltaRun> = {},
): FindingsDeltaRun {
  return {
    auditId,
    siteUrl: 'https://hotel.fr/',
    startedAt: auditId === 'before' ? '2026-06-03T09:00:00.000Z' : '2026-09-03T09:00:00.000Z',
    tool: {
      odysseusVersion: '1.0.0',
      findingsSchemaVersion: 1 as never,
      axeCoreVersion: '4.10.0',
      lighthouseVersion: '12.0.0',
      playwrightVersion: '1.50.0',
      chromiumVersion: '130',
    },
    config: { maxPages: Number.MAX_SAFE_INTEGER, maxDepth: 5 },
    findingsProvenance: {
      findingsSchemaVersion: 1 as never,
      normalizationFingerprint: 'abc',
      findingsDigest: `sha256:${auditId}`,
    },
    findings,
    ...overrides,
  };
}

const baselineFindings = [
  finding('fixed', 'critical', 'color-contrast'),
  finding('moved', 'moderate', 'link-name'),
  finding('kept-1', 'minor'),
  finding('kept-2', 'minor', 'label'),
];
const currentFindings = [
  finding('added', 'serious', 'button-name'),
  finding('moved', 'serious', 'link-name'),
  finding('kept-1', 'minor'),
  finding('kept-2', 'minor', 'label'),
];
const baseline = run('before', baselineFindings);
const current = run('after', currentFindings);

/** One delta per closed state the section can render. */
const STATES: Record<string, FindingsDelta> = {
  'all-classes': computeFindingsDelta(baseline, current),
  'no-change': computeFindingsDelta(
    run('before', [finding('kept', 'minor')]),
    run('after', [finding('kept', 'minor')]),
  ),
  'tool-version-suppression': computeFindingsDelta(
    baseline,
    run('after', currentFindings, {
      tool: { ...current.tool, axeCoreVersion: null, chromiumVersion: '131' },
    }),
  ),
  'normalization-suppression': computeFindingsDelta(
    baseline,
    run('after', currentFindings, {
      findingsProvenance: { ...current.findingsProvenance, normalizationFingerprint: 'def' },
    }),
  ),
  'crawl-scope-disclosure': computeFindingsDelta(
    baseline,
    run('after', currentFindings, { config: { maxPages: 50, maxDepth: 3 } }),
  ),
};

const LANGUAGES: readonly ReportLanguage[] = ['fr', 'en'];

function tagSequence(html: string): string[] {
  return [...html.matchAll(/<\/?[a-z][a-z0-9]*/g)].map((match) => match[0]);
}

describe('findings delta golden output', () => {
  for (const [state, delta] of Object.entries(STATES)) {
    for (const language of LANGUAGES) {
      it(`matches the committed ${language.toUpperCase()} golden for ${state}`, async () => {
        const html = renderFindingsDelta(getStrings(language), 2, language, delta);
        await expect(html).toMatchFileSnapshot(
          `__golden__/findings-delta.${state}.${language}.html`,
        );
      });
    }
  }
});

describe('findings delta FR/EN parity', () => {
  it.each(Object.keys(STATES))('renders %s with the same structure in both languages', (state) => {
    const delta = STATES[state]!;
    const fr = renderFindingsDelta(getStrings('fr'), 2, 'fr', delta);
    const en = renderFindingsDelta(getStrings('en'), 2, 'en', delta);
    expect(tagSequence(fr)).toEqual(tagSequence(en));
  });

  it('covers every delta class and both suppression causes', () => {
    const all = STATES['all-classes']!;
    for (const cls of ['new', 'resolved', 'persistent', 'changed-severity'] as const) {
      expect(all.counts[cls]).toBeGreaterThan(0);
    }
    expect(STATES['tool-version-suppression']!.changedSeveritySuppressed).toBe(true);
    expect(STATES['normalization-suppression']!.changedSeveritySuppressed).toBe(true);
    expect(STATES['crawl-scope-disclosure']!.changedSeveritySuppressed).toBe(false);
    expect(STATES['normalization-suppression']!.normalizationChanged).toBe(true);
    expect(STATES['crawl-scope-disclosure']!.configDifferences.length).toBeGreaterThan(0);
    expect(STATES['tool-version-suppression']!.versionDifferences.length).toBeGreaterThan(0);
  });
});

describe('re-audit report rendering', () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in a render')));

  beforeEach(() => {
    modelEntryCalls.length = 0;
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
  });

  it('spies on the model entry points, so the empty call list below is not vacuous', async () => {
    const llm = await import('@odysseus/llm');
    expect(() => llm.getOpenAiApiKey()).toThrow(/model entry/);
    expect(modelEntryCalls).toEqual(['getOpenAiApiKey']);
  });

  it.each(LANGUAGES)(
    'renders the %s re-audit report without calling a model entry point or the network',
    async (language) => {
      const manifest = await loadSmallSiteManifest();
      const findings = await loadSmallSiteFindings();
      const analysis = await loadSmallSiteAnalysis(language);
      const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

      const html = await renderHtml({
        manifest,
        findings,
        analysis,
        renderDiffEvidencePages,
        delta: STATES['all-classes']!,
      });

      expect(html).toContain('id="section-16"');
      expect(modelEntryCalls).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('keeps the no-baseline report structure identical to the report minus the delta section', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const sectionIds = (html: string) =>
      [...html.matchAll(/<section class="sheet[^"]*" id="(section-[^"]+)">/g)].map(
        (match) => match[1],
      );

    const withoutDelta = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
    });
    const withDelta = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      delta: STATES['all-classes']!,
    });

    expect(sectionIds(withoutDelta)).toEqual(
      sectionIds(withDelta).filter((id) => id !== 'section-16'),
    );
    const { findingsDelta: fr } = getStrings('fr');
    expect(withoutDelta).not.toContain('section-16');
    expect(withoutDelta).not.toContain(fr.eyebrow);
    expect(
      await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages }),
    ).toStrictEqual(withoutDelta);
  });
});
