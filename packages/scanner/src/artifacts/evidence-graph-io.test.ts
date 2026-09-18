import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleAuditEvidenceGraph } from '../evidence-graph.js';
import { cleanInput } from '../evidence-graph-fixtures.js';
import {
  approveAuditEvidence,
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
  it('writes the roots first and approves them only on request', () => {
    const dir = auditDir();
    const graph = assembleAuditEvidenceGraph(cleanInput());
    writeAuditEvidenceGraph(dir, graph);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
    approveAuditEvidence(dir, graph);
    expect(readApprovedAuditEvidence(dir)?.auditEvidenceSnapshotDigest).toBe(graph.audit.digest);
    expect(readApprovedAuditEvidence(dir)?.rawEvidenceSnapshotDigest).toBe(graph.raw.digest);
    expect(readAuditEvidenceSnapshot(dir)?.digest).toBe(graph.audit.digest);
    expect(readEvidenceQualityAssessment(dir)?.digest).toBe(graph.quality.digest);
    expect(fs.existsSync(path.join(dir, EVIDENCE_GRAPH_DIRNAME, 'check-attempt-ledger.json'))).toBe(
      true,
    );
  });

  it('refuses to approve a root that no longer reads back as assembled', () => {
    const dir = auditDir();
    const graph = assembleAuditEvidenceGraph(cleanInput());
    writeAuditEvidenceGraph(dir, graph);
    fs.writeFileSync(
      path.join(dir, EVIDENCE_GRAPH_DIRNAME, 'evidence-quality-assessment.json'),
      `${JSON.stringify({ verdict: 'reportable-complete' }, null, 2)}\n`,
      'utf8',
    );
    expect(() => approveAuditEvidence(dir, graph)).toThrow(/does not read back as assembled/);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
  });

  it('refuses to approve a graph that carries no approval', () => {
    const dir = auditDir();
    const blocked = assembleAuditEvidenceGraph(cleanInput({ robotsChain: [] }));
    expect(blocked.approval).toBeUndefined();
    writeAuditEvidenceGraph(dir, blocked);
    expect(() => approveAuditEvidence(dir, blocked)).toThrow(/carries no approval/);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
  });

  it('drops an earlier approval when the recomputed graph is not approved', () => {
    const dir = auditDir();
    const graph = assembleAuditEvidenceGraph(cleanInput());
    writeAuditEvidenceGraph(dir, graph);
    approveAuditEvidence(dir, graph);
    const blocked = assembleAuditEvidenceGraph(cleanInput({ robotsChain: [] }));
    expect(blocked.approval).toBeUndefined();
    writeAuditEvidenceGraph(dir, blocked);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
    expect(readEvidenceQualityAssessment(dir)?.verdict).toBe('failed');
    expect(readAuditEvidenceSnapshot(dir)?.digest).toBe(blocked.audit.digest);
  });

  it('removes an approval on request and tolerates a missing one', () => {
    const dir = auditDir();
    const graph = assembleAuditEvidenceGraph(cleanInput());
    writeAuditEvidenceGraph(dir, graph);
    approveAuditEvidence(dir, graph);
    removeApprovedAuditEvidence(dir);
    expect(readApprovedAuditEvidence(dir)).toBeUndefined();
    expect(() => removeApprovedAuditEvidence(dir)).not.toThrow();
  });
});
