import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, ObligationAssessment } from '@odysseus/core';
import { buildFindingsProvenance } from '@odysseus/core';
import { buildFallbackSiteContext, filterFindingsForLlm } from './build-input.js';
import { partitionFindings } from './diversion.js';
import type { StructureDocument } from './structure-schema.js';
import { deriveTransactionalFlowStatus } from './transactional-flow-guard.js';
import type { WritingPassOutput } from './writing-schema.js';
import {
  aggregateRuns,
  assembleWritingInput,
  currentProseText,
  faithfulnessIssue,
  parseMeasureArgs,
  projectWrittenFromStoredAnalysis,
  registerProposals,
  type CampaignRun,
  type StoredAnalysisArtifact,
} from './measure-correction-review.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** The committed multi-page scan fixture, reused so manifest and findings
 *  are a real, internally consistent audit rather than hand-built shapes. */
function loadManifest(): AuditManifest {
  const manifest = JSON.parse(
    readFileSync(
      path.join(moduleDir, '../../../fixtures/test-audits/multi-page/manifest.json'),
      'utf-8',
    ),
  ) as AuditManifest;
  return {
    ...manifest,
    auditId: 'test-audit',
    findingsProvenance: buildFindingsProvenance(loadFindings()),
  };
}

function loadFindings(): Finding[] {
  return JSON.parse(
    readFileSync(
      path.join(moduleDir, '../../../fixtures/test-audits/multi-page/findings.json'),
      'utf-8',
    ),
  ) as Finding[];
}

function eligibleFindingId(): string {
  const { forModel } = partitionFindings(filterFindingsForLlm(loadFindings()), loadManifest());
  const finding = forModel[0];
  if (!finding) throw new Error('fixture has no eligible finding');
  return finding.findingId;
}

function structureDoc(): StructureDocument {
  return {
    auditId: 'test-audit',
    themes: [
      {
        themeKey: 't1',
        category: 'accessibility',
        findingIds: [eligibleFindingId()],
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
      },
    ],
    quickWins: [],
    overallRisk: 'medium',
    model: 'test-model',
    temperature: 0.2,
    generatedAt: '2026-09-11T08:00:00.000Z',
    findingsProvenance: buildFindingsProvenance(loadFindings()),
  };
}

function storedAnalysis(): StoredAnalysisArtifact {
  return {
    analysisId: 'analysis-1',
    auditId: 'test-audit',
    findingsProvenance: buildFindingsProvenance(loadFindings()),
    language: 'fr',
    generatedAt: '2026-09-11T08:05:00.000Z',
    executiveSummary: 'Resume.',
    notes: '',
    themes: [
      {
        title: 'Titre',
        businessImpact: 'Impact un. Impact deux. Impact trois.',
        recommendedActions: ['Action une.', 'Action deux.'],
      },
    ],
    siteContext: {
      businessType: 'hotel',
      primaryGoal: 'bookings',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    obligationAssessment: {
      siteSignalResolutions: { hasTransactionalFlow: { value: false } },
      basis: [{ facts: [{ kind: 'transactional-flow-unknown' }] }],
    } as unknown as ObligationAssessment,
  };
}

describe('parseMeasureArgs', () => {
  it('parses the language and resolves every named path', () => {
    const args = parseMeasureArgs(['--language', 'fr', 'artifacts/x/analyses/a-fr.json']);
    expect(args.language).toBe('fr');
    expect(args.paths).toEqual([path.resolve('artifacts/x/analyses/a-fr.json')]);
  });

  it('rejects a missing, duplicated, or invalid language and an empty path list', () => {
    expect(() => parseMeasureArgs(['a-fr.json'])).toThrow('--language <fr|en> is required');
    expect(() => parseMeasureArgs(['--language', 'de', 'a-fr.json'])).toThrow(
      '--language must be fr or en',
    );
    expect(() => parseMeasureArgs(['--language', 'fr', '--language', 'en', 'a-fr.json'])).toThrow(
      'more than once',
    );
    expect(() => parseMeasureArgs(['--language', 'fr'])).toThrow('never walks a directory tree');
  });
});

describe('deriveTransactionalFlowStatus', () => {
  const assessment = (overrides: {
    resolution?: { value: boolean };
    factKinds?: string[];
  }): ObligationAssessment =>
    ({
      siteSignalResolutions: overrides.resolution
        ? { hasTransactionalFlow: overrides.resolution }
        : {},
      basis: [{ facts: (overrides.factKinds ?? []).map((kind) => ({ kind })) }],
    }) as unknown as ObligationAssessment;

  it('mirrors the analysis stage derivation exactly', () => {
    expect(deriveTransactionalFlowStatus(assessment({ resolution: { value: true } }))).toBe(
      'present',
    );
    expect(deriveTransactionalFlowStatus(assessment({}))).toBe('unknown');
    expect(
      deriveTransactionalFlowStatus(
        assessment({
          resolution: { value: false },
          factKinds: ['transactional-flow-inconclusive'],
        }),
      ),
    ).toBe('inconclusive');
    expect(
      deriveTransactionalFlowStatus(
        assessment({ resolution: { value: false }, factKinds: ['transactional-flow-unknown'] }),
      ),
    ).toBe('unknown');
    expect(
      deriveTransactionalFlowStatus(
        assessment({ resolution: { value: false }, factKinds: ['other'] }),
      ),
    ).toBe('absent');
  });
});

describe('projectWrittenFromStoredAnalysis', () => {
  it('projects the prose verbatim and re-joins theme keys by structure index', () => {
    const written = projectWrittenFromStoredAnalysis(storedAnalysis(), structureDoc());
    expect(written).toEqual({
      executiveSummary: 'Resume.',
      notes: '',
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact un. Impact deux. Impact trois.',
          recommendedActions: ['Action une.', 'Action deux.'],
        },
      ],
    });
  });

  it('rejects a theme-count change between the analysis and the structure', () => {
    const doc = structureDoc();
    doc.themes.push({ ...doc.themes[0]!, themeKey: 't2', priorityRank: 2 });
    expect(() => projectWrittenFromStoredAnalysis(storedAnalysis(), doc)).toThrow(
      'structure grouping changed',
    );
  });
});

describe('faithfulnessIssue', () => {
  const args = (overrides: {
    structureFilename?: string | undefined;
    structureDoc?: StructureDocument | undefined;
    manifest?: AuditManifest | undefined;
    stored?: StoredAnalysisArtifact | undefined;
  }) => ({
    // `in` checks, not ?? defaults: a test must be able to pass an explicit
    // undefined for an optional artifact.
    structureFilename:
      'structureFilename' in overrides
        ? overrides.structureFilename
        : '2026-09-11T08-00-00Z-structure.json',
    manifest: overrides.manifest ?? loadManifest(),
    allFindings: loadFindings(),
    structureDoc: 'structureDoc' in overrides ? overrides.structureDoc : structureDoc(),
    stored: overrides.stored ?? storedAnalysis(),
  });

  it('accepts aligned artifacts', () => {
    expect(faithfulnessIssue(args({}))).toBeUndefined();
  });

  it('skips when no structure document exists', () => {
    expect(
      faithfulnessIssue(args({ structureFilename: undefined, structureDoc: undefined })),
    ).toContain('no stored structure document');
  });

  it('skips a structure generated after the analysis', () => {
    const doc = structureDoc();
    doc.generatedAt = '2026-09-11T09:00:00.000Z';
    expect(faithfulnessIssue(args({ structureDoc: doc }))).toContain('after this analysis');
  });

  it('skips an auditId mismatch', () => {
    const stored = storedAnalysis();
    stored.auditId = 'other-audit';
    expect(faithfulnessIssue(args({ stored }))).toContain('auditId mismatch');
  });

  it('skips a findings provenance mismatch', () => {
    const stored = storedAnalysis();
    stored.findingsProvenance = {
      ...(buildFindingsProvenance(loadFindings()) as { findingsDigest: string }),
      findingsDigest: 'sha256:' + '0'.repeat(64),
    };
    expect(faithfulnessIssue(args({ stored }))).toContain('findings digest');
  });
});

describe('assembleWritingInput', () => {
  it('rebuilds the writer input from the stored artifacts', () => {
    const stored = storedAnalysis();
    const input = assembleWritingInput({
      manifest: loadManifest(),
      allFindings: loadFindings(),
      structureDoc: structureDoc(),
      stored,
      language: 'fr',
    });
    expect(input.language).toBe('fr');
    expect(input.siteContext).toEqual(stored.siteContext);
    expect(input.transactionalFlowStatus).toBe('unknown');
    expect(input.themes[0]?.themeKey).toBe('t1');
    expect(input.themes[0]?.findings).toHaveLength(1);
    expect(input.siteStats.totalFindings).toBe(loadFindings().length);
    expect(input.providerPhrase).toBeTruthy();
  });

  it('falls back to the deterministic context when the analysis stored none', () => {
    const stored = storedAnalysis();
    delete stored.siteContext;
    const input = assembleWritingInput({
      manifest: loadManifest(),
      allFindings: loadFindings(),
      structureDoc: structureDoc(),
      stored,
      language: 'en',
    });
    expect(input.siteContext).toEqual(buildFallbackSiteContext());
    expect(input.language).toBe('en');
  });
});

describe('currentProseText', () => {
  const written: WritingPassOutput = {
    executiveSummary: 'Summary text.',
    notes: 'Notes text.',
    themes: [
      {
        themeKey: 't1',
        title: 'Titre',
        businessImpact: 'Impact text.',
        recommendedActions: ['Action one.', 'Action two.'],
      },
    ],
  };

  it('resolves every eligible address form', () => {
    expect(currentProseText(written, 'executiveSummary')).toBe('Summary text.');
    expect(currentProseText(written, 'notes')).toBe('Notes text.');
    expect(currentProseText(written, 'themes(t1).businessImpact')).toBe('Impact text.');
    expect(currentProseText(written, 'themes(t1).recommendedActions[1]')).toBe('Action two.');
  });

  it('never throws on an address the correlation guard would have rejected', () => {
    expect(currentProseText(written, 'themes(ghost).businessImpact')).toContain('did not resolve');
    expect(currentProseText(written, 'themes(t1).recommendedActions[9]')).toContain(
      'did not resolve',
    );
  });
});

describe('aggregateRuns', () => {
  const written: WritingPassOutput = {
    executiveSummary: 'Summary.',
    notes: '',
    themes: [
      {
        themeKey: 't1',
        title: 'Titre',
        businessImpact: 'Impact.',
        recommendedActions: ['Action.'],
      },
    ],
  };
  const reconstructed = { writingInput: {} as never, written, structureFilename: 's.json' };
  const file = path.join('/tmp/x', 'analyses', '2026-09-11T08-05-00Z-fr.json');

  it('totals verdicts, checks, tokens once per call, and latency bounds', () => {
    const runs: CampaignRun[] = [
      {
        file,
        relativeFile: 'x/analyses/a-fr.json',
        language: 'fr',
        stage: 'file-skip',
        fileSkipReason: 'no stored structure document for this audit',
      },
      {
        file,
        relativeFile: 'x/analyses/b-fr.json',
        language: 'fr',
        stage: 'measured',
        reconstructed,
        wallMs: 300,
        outcome: {
          status: 'ok',
          model: 'm',
          temperature: 0.2,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          output: {
            proposals: [
              { field: 'executiveSummary', checks: [], verdict: 'keep', reason: 'r' },
              { field: 'notes', checks: [], verdict: 'keep', reason: 'r' },
              {
                field: 'themes(t1).businessImpact',
                checks: ['language-quality', 'repetition'],
                verdict: 'propose-change',
                reason: 'r',
                replacement: 'Meilleur impact.',
              },
              {
                field: 'themes(t1).recommendedActions[0]',
                checks: ['translation-parity'],
                verdict: 'unsure',
                reason: 'r',
              },
            ],
          },
        },
      },
      {
        file,
        relativeFile: 'x/analyses/c-fr.json',
        language: 'fr',
        stage: 'measured',
        reconstructed,
        wallMs: 100,
        outcome: {
          status: 'skipped',
          reason: 'provider unavailable',
          model: 'm',
          temperature: 0.2,
        },
      },
    ];
    const totals = aggregateRuns(runs);
    expect(totals.named).toBe(3);
    expect(totals.fileSkips).toBe(1);
    expect(totals.providerCalls).toBe(2);
    expect(totals.passOk).toBe(1);
    expect(totals.passSkipped).toBe(1);
    expect(totals.fieldsReviewed).toBe(4);
    expect(totals.keep).toBe(2);
    expect(totals.proposeChange).toBe(1);
    expect(totals.unsure).toBe(1);
    expect(totals.byCheck['language-quality']).toBe(1);
    expect(totals.byCheck['repetition']).toBe(1);
    expect(totals.byCheck['translation-parity']).toBe(1);
    expect(totals.byCheck['unsupported-specific-claim']).toBe(0);
    // Token usage is a property of the call, not of each proposal.
    expect(totals.promptTokens).toBe(100);
    expect(totals.completionTokens).toBe(50);
    expect(totals.totalTokens).toBe(150);
    expect(totals.latencyMinMs).toBe(100);
    expect(totals.latencyMaxMs).toBe(300);
  });

  it('reports zeros and nulls for an empty campaign', () => {
    const totals = aggregateRuns([]);
    expect(totals.named).toBe(0);
    expect(totals.providerCalls).toBe(0);
    expect(totals.totalTokens).toBe(0);
    expect(totals.latencyMinMs).toBeNull();
    expect(totals.latencyMaxMs).toBeNull();
  });
});

describe('registerProposals', () => {
  const written: WritingPassOutput = {
    executiveSummary: 'Summary.',
    notes: '',
    themes: [
      {
        themeKey: 't1',
        title: 'Titre',
        businessImpact: 'Impact actuel.',
        recommendedActions: ['Action.'],
      },
    ],
  };

  it('lists non-keep proposals with stable ids and the current text', () => {
    const file = path.join('/tmp/x', 'analyses', '2026-09-11T08-05-00Z-fr.json');
    const run: CampaignRun = {
      file,
      relativeFile: 'x/analyses/2026-09-11T08-05-00Z-fr.json',
      language: 'fr',
      stage: 'measured',
      reconstructed: { writingInput: {} as never, written, structureFilename: 's.json' },
      wallMs: 10,
      outcome: {
        status: 'ok',
        model: 'm',
        temperature: 0.2,
        output: {
          proposals: [
            { field: 'executiveSummary', checks: [], verdict: 'keep', reason: 'r' },
            { field: 'notes', checks: [], verdict: 'keep', reason: 'r' },
            {
              field: 'themes(t1).businessImpact',
              checks: ['unhedged-causality'],
              verdict: 'propose-change',
              reason: 'The wording states causality.',
              replacement: 'Impact possible.',
            },
            {
              field: 'themes(t1).recommendedActions[0]',
              checks: [],
              verdict: 'unsure',
              reason: 'No clear issue.',
            },
          ],
        },
      },
    };
    const entries = registerProposals(run);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('2026-09-11T08-05-00Z-fr.json#themes(t1).businessImpact');
    expect(entries[0]?.current).toBe('Impact actuel.');
    const first = entries[0]?.proposal;
    if (first?.verdict === 'propose-change') {
      expect(first.replacement).toBe('Impact possible.');
    } else {
      throw new Error('first non-keep proposal should be a propose-change');
    }
    expect(entries[1]?.id).toBe('2026-09-11T08-05-00Z-fr.json#themes(t1).recommendedActions[0]');
  });

  it('returns nothing for skipped runs', () => {
    expect(
      registerProposals({
        file: '/tmp/a-fr.json',
        relativeFile: 'a-fr.json',
        language: 'fr',
        stage: 'file-skip',
        fileSkipReason: 'x',
      }),
    ).toEqual([]);
    expect(
      registerProposals({
        file: '/tmp/a-fr.json',
        relativeFile: 'a-fr.json',
        language: 'fr',
        stage: 'measured',
        reconstructed: { writingInput: {} as never, written, structureFilename: 's.json' },
        outcome: { status: 'skipped', reason: 'x', model: 'm', temperature: 0.2 },
      }),
    ).toEqual([]);
  });
});
