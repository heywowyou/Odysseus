/**
 * Issue #554: the dashboard bundle reads no workspace package, so its
 * severity words are a copy of core's canonical table, held equal here.
 */
import { describe, expect, it } from 'vitest';
import { severityHeadings } from '@odysseus/core';
import { common } from './sections/common.js';

describe('dashboard severity labels', () => {
  it.each(['fr', 'en'] as const)('match the canonical %s severity words', (language) => {
    expect(common[language].severityLabels).toEqual(severityHeadings(language));
  });
});
