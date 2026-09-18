import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleAuditEvidenceGraph } from '../evidence-graph.js';
import { cleanInput } from '../evidence-graph-fixtures.js';
import {
  EVIDENCE_GRAPH_DIRNAME,
  readApprovedAuditEvidence,
  readAuditEvidenceSnapshot,
  readEvidenceQualityAssessment,
  removeApprovedAuditEvidence,
  writeAuditEvidenceGraph,
} from './evidence-graph-io.js';

const dirs: string[] = [];
function auditDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-evidence-graph-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Plan 059 evidence graph persistence', () => {
  it('writes an approved graph whose roots read back unchanged', () => {
    const dir = auditDir();
    const graph = assembleAuditEvidenceGraph(cleanInput());
    writeAuditEvidenceGraph(dir, graph);
    expect(readApprovedAuditEvidence(dir)?.auditEvidenceSnapshotDigest).toBe(graph.audit.digest);
    expect(readAuditEvidenceSnapshot(dir)?.digest).toBe(graph.audit.digest);
    expect(readEvidenceQualityAssessment(dir)?.digest).toBe(graph.quality.digest);
    expect(fs.existsSync(path.join(dir, EVIDENCE_GRAPH_DIRNAME, 'check-attempt-ledger.json'))).toBe(
      true,
    );
  });

  it('drops an earlier approval when the recomputed graph is not approved', () => {
    const dir = auditDir();
    writeAuditEvidenceGraph(dir, assembleAuditEvidenceGraph(cleanInput()));
    const blocked = assembleAuditEvidenceGraph(cleanInput({ robotsChain: [] }));
    expect(blocked.approval).toBeUndefined();
    writeAuditEvidenceGraph(dir, blocked);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
    expect(readEvidenceQualityAssessment(dir)?.verdict).toBe('failed');
    expect(readAuditEvidenceSnapshot(dir)?.digest).toBe(blocked.audit.digest);
  });

  it('removes an approval on request and tolerates a missing one', () => {
    const dir = auditDir();
    writeAuditEvidenceGraph(dir, assembleAuditEvidenceGraph(cleanInput()));
    removeApprovedAuditEvidence(dir);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
    expect(() => removeApprovedAuditEvidence(dir)).not.toThrow();
  });
});
