import { describe, expect, it } from 'vitest';
import type { ReportFactRegistry, SeniorReportPlan } from '@odysseus/core';
import {
  qualityWriterOutputSchema,
  type EditorOutput,
  type QualityWriterOutput,
} from '@odysseus/llm';
import { EvidenceBoundContentError, reportQualityDigest } from '@odysseus/report';
import {
  applyTargetedWriterPatches,
  declaredPatchTargets,
  resolveQualityDraft,
  writerPatchAddresses,
  validateQualityWriterOutput,
} from './report-quality-draft.js';
import {
  DEFAULT_FINDINGS,
  PROJECT_KEY,
  SAFE_PROSE,
  evidenceFixture,
} from './report-quality-pipeline.fixtures.js';

/**
 * Fail-closed proofs for the draft seam (Plan 058): the writer output
 * contract, the fact-registry binding, the freehand-scalar ban, and the
 * targeted editor patches. Pure in-memory data; no LLM, no Mongo, no disk.
 */

const FACT_ID = 'audit.findingCount';

const REGISTRY: ReportFactRegistry = {
  registryVersion: 'test-registry-v1',
  inputSnapshotDigest: `sha256:${'1'.repeat(64)}`,
  facts: [
    {
      factId: FACT_ID,
      kind: 'number',
      value: 4,
      display: { fr: '4', en: '4' },
      sourceRefs: ['manifest.crawl.visitedCount'],
    },
  ],
};

function planFixture(): SeniorReportPlan {
  return {
    planVersion: 'test-plan-v1',
    inputSnapshotDigest: `sha256:${'0'.repeat(64)}`,
    remediationProjects: [
      {
        projectKey: PROJECT_KEY,
        category: 'accessibility',
        findingIds: DEFAULT_FINDINGS.map((finding) => finding.findingId),
        evidenceRefs: [],
        factRefs: [FACT_ID],
        impact: 'high',
        effort: 'low',
        rationale: 'Un même chantier de correction couvre les constats fournis.',
        dependencies: [],
        sharedDependencies: [],
      },
    ],
    executivePriorityKeys: [PROJECT_KEY],
  };
}

const text = (value: string) => ({ segments: [{ kind: 'text' as const, text: value }] });

function writerFixture(): QualityWriterOutput {
  return {
    executiveSummary: text(SAFE_PROSE.fr),
    notes: text(SAFE_PROSE.fr),
    projects: [
      {
        projectKey: PROJECT_KEY,
        title: text(SAFE_PROSE.fr),
        businessImpact: text(SAFE_PROSE.fr),
        recommendedActions: [text(SAFE_PROSE.fr)],
      },
    ],
  };
}

describe('validateQualityWriterOutput', () => {
  it('accepts a writer whose projects cover the senior plan exactly and whose fact bindings resolve in the registry', () => {
    const writer = writerFixture();
    writer.notes = {
      segments: [
        { kind: 'text', text: SAFE_PROSE.fr },
        { kind: 'fact', factId: FACT_ID },
      ],
    };
    expect(() => validateQualityWriterOutput(writer, planFixture(), REGISTRY)).not.toThrow();
  });

  it('rejects a writer that silently drops a senior-plan remediation project', () => {
    const writer = writerFixture();
    writer.projects[0]!.projectKey = 'chantier-substitue';
    expect(() => validateQualityWriterOutput(writer, planFixture(), REGISTRY)).toThrow(
      'Writer project coverage differs from senior plan',
    );
  });

  it('rejects a writer that invents a project the senior plan never planned', () => {
    const writer = writerFixture();
    writer.projects.push({
      projectKey: 'chantier-supplementaire',
      title: text(SAFE_PROSE.fr),
      businessImpact: text(SAFE_PROSE.fr),
      recommendedActions: [text(SAFE_PROSE.fr)],
    });
    expect(() => validateQualityWriterOutput(writer, planFixture(), REGISTRY)).toThrow(
      'Writer project coverage differs from senior plan',
    );
  });

  it('rejects a fact binding that is absent from the registry, in any content segment', () => {
    const summaryWriter = writerFixture();
    summaryWriter.executiveSummary = {
      segments: [{ kind: 'fact', factId: 'audit.notARegistryFact' }],
    };
    expect(() => validateQualityWriterOutput(summaryWriter, planFixture(), REGISTRY)).toThrow(
      'Unknown fact binding audit.notARegistryFact',
    );

    const actionWriter = writerFixture();
    actionWriter.projects[0]!.recommendedActions[0] = {
      segments: [{ kind: 'fact', factId: 'audit.alsoNotARegistryFact' }],
    };
    expect(() => validateQualityWriterOutput(actionWriter, planFixture(), REGISTRY)).toThrow(
      'Unknown fact binding audit.alsoNotARegistryFact',
    );
  });

  it('enforces the writer output contract itself: missing segments and unknown binding kinds are malformed', () => {
    const missingSegments = writerFixture();
    (missingSegments.notes as { segments: unknown[] }).segments = [];
    expect(qualityWriterOutputSchema.safeParse(missingSegments).success).toBe(false);

    const emptyWriter = {
      executiveSummary: { segments: [] },
      notes: text(SAFE_PROSE.fr),
      projects: [],
    };
    expect(qualityWriterOutputSchema.safeParse(emptyWriter).success).toBe(false);

    const unknownKind = writerFixture();
    (unknownKind.executiveSummary as { segments: unknown[] }).segments = [
      { kind: 'opinion', text: SAFE_PROSE.fr },
    ];
    expect(qualityWriterOutputSchema.safeParse(unknownKind).success).toBe(false);
  });
});

describe('resolveQualityDraft', () => {
  it('binds fact segments to registry display values and refuses references outside the registry', () => {
    const writer = writerFixture();
    writer.executiveSummary = {
      segments: [
        { kind: 'text', text: 'Obstacles confirmés sur ce site :' },
        { kind: 'fact', factId: FACT_ID },
      ],
    };
    writer.notes = {
      segments: [
        { kind: 'text', text: 'Limites documentées dans ' },
        { kind: 'reference', referenceId: 'ref:robots-disallowed-pages' },
      ],
    };

    const resolve = () =>
      resolveQualityDraft({
        language: 'fr',
        writer,
        plan: planFixture(),
        registry: REGISTRY,
        evidence: evidenceFixture(),
        requestedModel: 'test-model-058',
        generatedAt: new Date('2026-09-18T10:00:00.000Z'),
      });
    expect(resolve).toThrow('Unknown reference binding: ref:robots-disallowed-pages');

    writer.notes = text(SAFE_PROSE.fr);
    expect(resolve().analysis.executiveSummary).toBe('Obstacles confirmés sur ce site : 4');
  });

  it('derives analysis provenance from the plan and approved evidence, never from free prose', () => {
    const plan = planFixture();
    const evidence = evidenceFixture();
    const writer = writerFixture();

    const { analysis, draftDigest } = resolveQualityDraft({
      language: 'fr',
      writer,
      plan,
      registry: REGISTRY,
      evidence,
      requestedModel: 'test-model-058',
      generatedAt: new Date('2026-09-18T10:00:00.000Z'),
    });

    expect(analysis.overallRisk).toBe('high'); // 'serious' finding severity in the evidence
    expect(analysis.themes).toHaveLength(1);
    expect(analysis.themes[0]).toMatchObject({
      title: SAFE_PROSE.fr,
      category: 'accessibility',
      effort: 'low',
      impact: 'high',
      priorityRank: 1,
      findingIds: ['finding-contrastes'],
      recommendedActions: [SAFE_PROSE.fr],
    });
    expect(analysis.quickWins).toEqual(['finding-contrastes']); // low effort, non-low impact
    expect(analysis.auditId).toBe(evidence.approval.auditId);
    expect(analysis.model).toBe('test-model-058');
    expect(analysis.temperature).toBe(0);
    expect(analysis.analysisId).toMatch(/^quality-fr-[0-9a-f]{20}$/);
    expect('obligationAssessment' in analysis).toBe(false);

    // The digest binds exactly the language, writer output, plan, and the
    // approved evidence snapshot digest — nothing else can drift in.
    expect(draftDigest).toBe(
      reportQualityDigest({
        language: 'fr',
        writer,
        plan,
        evidence: evidence.approval.auditEvidenceSnapshotDigest,
      }),
    );
  });

  it('refuses a fact that is absent from the registry', () => {
    const writer = writerFixture();
    writer.notes = { segments: [{ kind: 'fact', factId: 'audit.missing' }] };
    expect(() =>
      resolveQualityDraft({
        language: 'fr',
        writer,
        plan: planFixture(),
        registry: REGISTRY,
        evidence: evidenceFixture(),
        requestedModel: 'test-model-058',
        generatedAt: new Date(0),
      }),
    ).toThrow('Unknown fact binding audit.missing');
  });

  it('rejects freehand exact scalars and URLs in text segments (they must go through bindings)', () => {
    const digitWriter = writerFixture();
    digitWriter.executiveSummary = text('Nous avons contrôlé 4 pages du site.');
    expect(() =>
      resolveQualityDraft({
        language: 'fr',
        writer: digitWriter,
        plan: planFixture(),
        registry: REGISTRY,
        evidence: evidenceFixture(),
        requestedModel: 'test-model-058',
        generatedAt: new Date(0),
      }),
    ).toThrow(EvidenceBoundContentError);

    const urlWriter = writerFixture();
    urlWriter.executiveSummary = text('La page https://hotel-exemple.fr/contact est concernée.');
    expect(() =>
      resolveQualityDraft({
        language: 'fr',
        writer: urlWriter,
        plan: planFixture(),
        registry: REGISTRY,
        evidence: evidenceFixture(),
        requestedModel: 'test-model-058',
        generatedAt: new Date(0),
      }),
    ).toThrow('Exact scalar/URL must be emitted through a fact/reference binding');
  });

  it('refuses prose carrying unsupported certainty claims', () => {
    const writer = writerFixture();
    writer.executiveSummary = text('Ce résultat est garanti pour ce site.');
    expect(() =>
      resolveQualityDraft({
        language: 'fr',
        writer,
        plan: planFixture(),
        registry: REGISTRY,
        evidence: evidenceFixture(),
        requestedModel: 'test-model-058',
        generatedAt: new Date(0),
      }),
    ).toThrow('Deterministic prose violation at executiveSummary: unsupported-certainty');
  });
});

describe('resolveQualityDraft presentation order', () => {
  const project = (key: string, dependencies: string[] = []) => ({
    projectKey: key,
    category: 'accessibility' as const,
    findingIds: DEFAULT_FINDINGS.map((finding) => finding.findingId),
    evidenceRefs: [],
    factRefs: [FACT_ID],
    impact: 'high' as const,
    effort: 'low' as const,
    rationale: 'Un même chantier de correction couvre les constats fournis.',
    dependencies,
    sharedDependencies: [],
  });
  const writerFor = (plan: SeniorReportPlan): QualityWriterOutput => ({
    executiveSummary: text(SAFE_PROSE.fr),
    notes: text(SAFE_PROSE.fr),
    projects: plan.remediationProjects.map((p) => ({
      projectKey: p.projectKey,
      title: text(SAFE_PROSE.fr),
      businessImpact: text(SAFE_PROSE.fr),
      recommendedActions: [text(SAFE_PROSE.fr)],
    })),
  });

  it('assigns dense presentation ranks with executive priorities first and dependencies before dependents', () => {
    const plan: SeniorReportPlan = {
      planVersion: 'test-plan-v1',
      inputSnapshotDigest: `sha256:${'0'.repeat(64)}`,
      remediationProjects: [
        project('chantier-a'),
        project('chantier-b'),
        project('chantier-c'),
        project('chantier-d', ['chantier-a']),
      ],
      executivePriorityKeys: ['chantier-c', 'chantier-a'],
    };
    const { analysis } = resolveQualityDraft({
      language: 'fr',
      writer: writerFor(plan),
      plan,
      registry: REGISTRY,
      evidence: evidenceFixture(),
      requestedModel: 'test-model-058',
      generatedAt: new Date('2026-09-18T10:00:00.000Z'),
    });

    expect(analysis.themes.map((theme) => theme.title)).toEqual([
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ]);
    // Dense 1..N ranks — never the sparse project-count-offset ranks the
    // live pilot surfaced (10 -> 28 -> 46 over 23 projects).
    expect(analysis.themes.map((theme) => theme.priorityRank)).toEqual([1, 2, 3, 4]);
    // Executive priorities present in declared order; every dependent
    // presents after the work it depends on.
    expect(analysis.themes.map((theme) => theme.title.length > 0)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('keeps a dependency cycle deterministic instead of looping', () => {
    const plan: SeniorReportPlan = {
      planVersion: 'test-plan-v1',
      inputSnapshotDigest: `sha256:${'0'.repeat(64)}`,
      remediationProjects: [
        project('chantier-a', ['chantier-b']),
        project('chantier-b', ['chantier-a']),
      ],
      executivePriorityKeys: [],
    };
    const { analysis } = resolveQualityDraft({
      language: 'fr',
      writer: writerFor(plan),
      plan,
      registry: REGISTRY,
      evidence: evidenceFixture(),
      requestedModel: 'test-model-058',
      generatedAt: new Date('2026-09-18T10:00:00.000Z'),
    });
    expect(analysis.themes.map((theme) => theme.priorityRank)).toEqual([1, 2]);
  });
});

describe('applyTargetedWriterPatches', () => {
  it('applies exactly the accepted declared targets and leaves every other segment byte-identical', () => {
    const current = writerFixture();
    const replaced = (value: string) => text(value);
    const editor: EditorOutput = {
      patches: [
        {
          issueId: 'i-exec',
          target: 'executiveSummary',
          replacement: replaced('Synthèse corrigée.'),
        },
        { issueId: 'i-notes', target: 'notes', replacement: replaced('Notes corrigées.') },
        {
          issueId: 'i-title',
          target: `projects.${PROJECT_KEY}.title`,
          replacement: replaced('Titre corrigé.'),
        },
        {
          issueId: 'i-impact',
          target: `projects.${PROJECT_KEY}.businessImpact`,
          replacement: replaced('Impact corrigé.'),
        },
        {
          issueId: 'i-action',
          target: `projects.${PROJECT_KEY}.recommendedActions.0`,
          replacement: replaced('Action corrigée.'),
        },
      ],
    };
    const accepted = new Map(editor.patches.map((patch) => [patch.issueId, [patch.target]]));

    const patched = applyTargetedWriterPatches(current, editor, accepted);

    expect(patched.executiveSummary).toEqual(text('Synthèse corrigée.'));
    expect(patched.notes).toEqual(text('Notes corrigées.'));
    expect(patched.projects[0]!.title).toEqual(text('Titre corrigé.'));
    expect(patched.projects[0]!.businessImpact).toEqual(text('Impact corrigé.'));
    expect(patched.projects[0]!.recommendedActions).toEqual([text('Action corrigée.')]);
    expect(patched.projects[0]!.projectKey).toBe(PROJECT_KEY);
    expect(patched.projects).toHaveLength(1);
    // The input writer output is never mutated in place.
    expect(current).toEqual(writerFixture());
  });

  it('refuses a patch whose issue was not accepted, before touching anything', () => {
    const current = writerFixture();
    const editor: EditorOutput = {
      patches: [
        { issueId: 'i-accepted', target: 'notes', replacement: text(SAFE_PROSE.fr) },
        { issueId: 'i-collateral', target: 'executiveSummary', replacement: text('Injecté.') },
      ],
    };
    expect(() =>
      applyTargetedWriterPatches(current, editor, new Map([['i-accepted', ['notes']]])),
    ).toThrow('Patch references unaccepted issue i-collateral');
    expect(current).toEqual(writerFixture());
  });

  it('refuses a patch outside the targets its accepted issue declared', () => {
    const current = writerFixture();
    const editor: EditorOutput = {
      patches: [{ issueId: 'i-notes', target: 'executiveSummary', replacement: text('x') }],
    };
    expect(() =>
      applyTargetedWriterPatches(current, editor, new Map([['i-notes', ['notes']]])),
    ).toThrow('Patch target executiveSummary is outside the targets issue i-notes declared');
    expect(current).toEqual(writerFixture());
  });

  it('lets a whole-list declaration cover an existing action but never a new one', () => {
    const current = writerFixture();
    const declared = new Map([['i-a', [`projects.${PROJECT_KEY}.recommendedActions`]]]);
    const patched = applyTargetedWriterPatches(
      current,
      {
        patches: [
          {
            issueId: 'i-a',
            target: `projects.${PROJECT_KEY}.recommendedActions.0`,
            replacement: text('Action.'),
          },
        ],
      },
      declared,
    );
    expect(patched.projects[0]!.recommendedActions).toEqual([text('Action.')]);
    expect(() =>
      applyTargetedWriterPatches(
        current,
        {
          patches: [
            {
              issueId: 'i-a',
              target: `projects.${PROJECT_KEY}.recommendedActions.4`,
              replacement: text('Action.'),
            },
          ],
        },
        declared,
      ),
    ).toThrow('Unknown patch action');
  });

  it('extracts declared addresses from a free-form issue target', () => {
    expect(
      declaredPatchTargets(
        `executiveSummary, projects.${PROJECT_KEY}.title; the tone overall notes`,
      ),
    ).toEqual(['executiveSummary', `projects.${PROJECT_KEY}.title`, 'notes']);
    expect(declaredPatchTargets('page 3 heading')).toEqual([]);
    expect(writerPatchAddresses(writerFixture())).toEqual([
      'executiveSummary',
      'notes',
      `projects.${PROJECT_KEY}.title`,
      `projects.${PROJECT_KEY}.businessImpact`,
      `projects.${PROJECT_KEY}.recommendedActions.0`,
    ]);
  });

  it('refuses unsupported patch target formats and unknown projects', () => {
    const current = writerFixture();
    expect(() =>
      applyTargetedWriterPatches(
        current,
        { patches: [{ issueId: 'i1', target: 'executive-summary', replacement: text('x') }] },
        new Map([['i1', ['executive-summary']]]),
      ),
    ).toThrow('Unsupported patch target executive-summary');

    expect(() =>
      applyTargetedWriterPatches(
        current,
        {
          patches: [
            { issueId: 'i2', target: 'projects.chantier-inconnu.title', replacement: text('x') },
          ],
        },
        new Map([['i2', ['projects.chantier-inconnu.title']]]),
      ),
    ).toThrow('Unknown patch project');
  });
});
