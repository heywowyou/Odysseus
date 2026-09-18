import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_GRAPH_DIRNAME,
  readApprovedAuditEvidence,
  writeEvidenceGraphRoots,
} from './evidence-graph-io.js';

describe('Plan 059 evidence graph persistence', () => {
  it('keeps atomic evidence-root IO reachable', () => {
    expect(EVIDENCE_GRAPH_DIRNAME).toBe('evidence');
    expect(typeof readApprovedAuditEvidence).toBe('function');
    expect(typeof writeEvidenceGraphRoots).toBe('function');
  });
});
