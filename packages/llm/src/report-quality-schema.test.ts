import { describe, expect, it } from 'vitest';
import { evidenceBoundContentSchema, seniorPlanOutputSchema } from './report-quality-schema.js';

/** The live pilot (grandhotelchicago.paris, 2026-09-18) failed its first
 *  senior-analyst call because the model emitted explicit nulls for optional
 *  plan fields. These proofs pin the normalization: null means absent, and
 *  the normalized output satisfies the core contracts' plain optionality. */
describe('Plan 058 role output schemas', () => {
  const baseProject = {
    projectKey: 'priorites',
    category: 'accessibility',
    findingIds: ['finding-1'],
    evidenceRefs: [],
    factRefs: [],
    impact: 'high',
    effort: 'medium',
    rationale: 'Un problème sérieux touche des pages clés.',
    dependencies: [],
    sharedDependencies: [],
  };

  it('treats an explicit null optional field as absent in the senior plan', () => {
    const parsed = seniorPlanOutputSchema.parse({
      remediationProjects: [
        {
          ...baseProject,
          likelyRootCause: null,
          conditionality: null,
        },
        {
          ...baseProject,
          projectKey: 'performance',
          category: 'performance',
          likelyRootCause: {
            text: 'Un défaut de configuration explique ce constat.',
            confidence: 'medium',
            inference: true,
          },
          conditionality: 'Sous réserve des mesures du prestataire.',
        },
      ],
      executivePriorityKeys: ['priorites'],
    });

    expect(parsed.remediationProjects[0]?.likelyRootCause).toBeUndefined();
    expect(parsed.remediationProjects[0]?.conditionality).toBeUndefined();
    expect(parsed.remediationProjects[1]?.likelyRootCause).toEqual({
      text: 'Un défaut de configuration explique ce constat.',
      confidence: 'medium',
      inference: true,
    });
    expect(parsed.remediationProjects[1]?.conditionality).toBe(
      'Sous réserve des mesures du prestataire.',
    );
  });

  it('still refuses a malformed optional object and an empty root cause', () => {
    expect(() =>
      seniorPlanOutputSchema.parse({
        remediationProjects: [
          {
            ...baseProject,
            likelyRootCause: { text: '', confidence: 'medium', inference: true },
          },
        ],
        executivePriorityKeys: [],
      }),
    ).toThrow();
    expect(() =>
      seniorPlanOutputSchema.parse({
        remediationProjects: [{ ...baseProject, likelyRootCause: { confidence: 'low' } }],
        executivePriorityKeys: [],
      }),
    ).toThrow();
  });

  it('keeps fact segment format optional-and-normalizable in evidence-bound content', () => {
    expect(
      evidenceBoundContentSchema.parse({
        segments: [{ kind: 'fact', factId: 'findings.total', format: null }],
      }),
    ).toEqual({ segments: [{ kind: 'fact', factId: 'findings.total' }] });
  });
});
