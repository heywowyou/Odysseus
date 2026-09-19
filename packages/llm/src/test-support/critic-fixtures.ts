import type { WritingInput, WritingPassOutput } from '../writing-schema.js';
import { emptyWritingPerformanceEvidence } from '../writing-schema.js';

function finding(findingId: string, ruleId: string, title: string) {
  return {
    findingId,
    source: 'axe' as const,
    ruleId,
    category: 'accessibility' as const,
    severity: 'serious' as const,
    wcagCriteria: ['1.4.3'],
    title,
    description: title,
    pageUrls: ['https://example.com/'],
    occurrences: 1,
  };
}

/** Two accessibility themes with disjoint finding packets, for the Plan 070
 *  critic tests. */
export function criticWritingInput(): WritingInput {
  const stats = {
    pagesScanned: 2,
    totalFindings: 3,
    critical: 0,
    serious: 3,
    moderate: 0,
    minor: 0,
  };
  return {
    language: 'fr',
    siteContext: {
      businessType: 'hotel',
      primaryGoal: 'unknown',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    themes: [
      {
        themeKey: 't1',
        category: 'accessibility',
        findings: [
          finding('f1', 'color-contrast', 'Contraste insuffisant'),
          finding('f2', 'link-in-text-block', 'Liens non distingués'),
        ],
        trustedRemediations: [],
      },
      {
        themeKey: 't2',
        category: 'accessibility',
        findings: [finding('f3', 'image-alt', 'Images sans alternative textuelle')],
        trustedRemediations: [],
      },
    ],
    siteStats: stats,
    performanceEvidence: emptyWritingPerformanceEvidence(),
    summaryEvidence: {
      siteStats: stats,
      rankedThemes: [
        { themeKey: 't1', category: 'accessibility', priorityRank: 1 },
        { themeKey: 't2', category: 'accessibility', priorityRank: 2 },
      ],
      categoriesPresent: ['accessibility'],
      performance: emptyWritingPerformanceEvidence(),
      obligationStatus: 'unknown',
      limitations: [],
    },
    transactionalFlowStatus: 'unknown',
  };
}

export function criticWrittenOutput(): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contrastes et lisibilité',
        businessImpact: 'Certains textes restent difficiles à lire pour les visiteurs concernés.',
        recommendedActions: ['Augmentez le contraste des textes et des liens concernés.'],
      },
      {
        themeKey: 't2',
        title: 'Images sans description',
        businessImpact:
          'Les visiteurs qui utilisent un lecteur d’écran ne savent pas ce que montrent les images.',
        recommendedActions: ['Ajoutez une description courte à chaque image porteuse de sens.'],
      },
    ],
    executiveSummary: 'Les constats portent surtout sur la lisibilité et les images.',
    notes: 'La portée reste limitée aux éléments mesurés.',
  };
}
