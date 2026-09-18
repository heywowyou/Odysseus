import { describe, expect, it, vi } from 'vitest';
import type { Sha256Digest } from '@odysseus/core';
import { bytesDigest } from '@odysseus/report';
import {
  ReportQualityDag,
  ReportQualityDagError,
  ReportQualityReplayMissError,
  dagNodeKey,
} from './report-quality-dag.js';
import { InMemoryArtifactStore } from './report-quality-pipeline.fixtures.js';

const PARENTS = {
  role: 'writer-fr',
  profileDigest: `sha256:${'1'.repeat(64)}`,
  systemPromptDigest: `sha256:${'2'.repeat(64)}`,
  schemaDigest: `sha256:${'3'.repeat(64)}`,
  payloadDigest: `sha256:${'4'.repeat(64)}`,
  imageDigests: [`sha256:${'5'.repeat(64)}`],
};

const parseText = (value: unknown) => {
  if (typeof (value as { text?: unknown }).text !== 'string') throw new Error('bad output');
  return value as { text: string };
};

function liveDag(store = new InMemoryArtifactStore(), reuse = true) {
  return { store, dag: new ReportQualityDag(store, { reuse, mode: 'live' }) };
}

describe('ReportQualityDag (Plan 058 §15 content-addressed resume)', () => {
  it('reuses a node whose declared parents all match, re-parsing the recorded output', async () => {
    const { store, dag } = liveDag();
    const compute = vi.fn(async () => ({ output: { text: 'draft' } }));
    const first = await dag.run('model-writer-fr', PARENTS, compute, parseText);
    expect(first.outcome).toBe('computed');

    const resumed = new ReportQualityDag(store, { reuse: true, mode: 'live' });
    const parse = vi.fn(parseText);
    const second = await resumed.run('model-writer-fr', { ...PARENTS }, compute, parse);
    expect(second).toMatchObject({ outcome: 'reused', output: { text: 'draft' } });
    expect(second.nodeKey).toBe(first.nodeKey);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(resumed.nodes).toEqual([
      { node: 'model-writer-fr', nodeKey: first.nodeKey, outcome: 'reused' },
    ]);
  });

  it.each([
    ['payload', { payloadDigest: `sha256:${'a'.repeat(64)}` }],
    ['model profile', { profileDigest: `sha256:${'a'.repeat(64)}` }],
    ['system prompt', { systemPromptDigest: `sha256:${'a'.repeat(64)}` }],
    ['response schema', { schemaDigest: `sha256:${'a'.repeat(64)}` }],
    ['image bytes', { imageDigests: [`sha256:${'a'.repeat(64)}`] }],
    ['image order', { imageDigests: [] }],
    ['role', { role: 'writer-en' }],
  ])('invalidates the node when the %s parent changes', async (_name, change) => {
    const { dag } = liveDag();
    const compute = vi.fn(async () => ({ output: { text: `call ${compute.mock.calls.length}` } }));
    await dag.run('model-writer-fr', PARENTS, compute, parseText);
    const changed = await dag.run('model-writer-fr', { ...PARENTS, ...change }, compute, parseText);
    expect(changed.outcome).toBe('computed');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('never reuses across node names even with identical parents', async () => {
    const { dag } = liveDag();
    const compute = vi.fn(async () => ({ output: { text: 'x' } }));
    await dag.run('render-fr', PARENTS, compute, parseText);
    expect((await dag.run('render-en', PARENTS, compute, parseText)).outcome).toBe('computed');
  });

  it('fails closed on a record whose stored parents were altered', async () => {
    const { store, dag } = liveDag();
    const first = await dag.run(
      'model-writer-fr',
      PARENTS,
      async () => ({ output: { text: 'draft' } }),
      parseText,
    );
    const [key] = await store.list('report-quality/dag/model-writer-fr/');
    const record = JSON.parse((await store.get(key!))!.toString('utf8')) as {
      parents: typeof PARENTS;
    };
    record.parents.payloadDigest = `sha256:${'f'.repeat(64)}`;
    await store.put(key!, Buffer.from(JSON.stringify(record)));
    const compute = vi.fn(async () => ({ output: { text: 'recomputed' } }));
    await expect(dag.run('model-writer-fr', PARENTS, compute, parseText)).rejects.toThrow(
      ReportQualityDagError,
    );
    expect(compute).not.toHaveBeenCalled();
    expect(first.outcome).toBe('computed');
  });

  it('refuses a reused output that no longer passes the schema', async () => {
    const { store, dag } = liveDag();
    await dag.run('model-writer-fr', PARENTS, async () => ({ output: { text: 'ok' } }), parseText);
    const [key] = await store.list('report-quality/dag/model-writer-fr/');
    const record = JSON.parse((await store.get(key!))!.toString('utf8')) as { output: unknown };
    record.output = { text: 42 };
    await store.put(key!, Buffer.from(JSON.stringify(record)));
    await expect(
      dag.run('model-writer-fr', PARENTS, async () => ({ output: { text: 'ok' } }), parseText),
    ).rejects.toThrow('bad output');
  });

  it('recomputes every node with reuse off and never rewrites the first record', async () => {
    const { store, dag } = liveDag();
    await dag.run(
      'model-writer-fr',
      PARENTS,
      async () => ({ output: { text: 'first' } }),
      parseText,
    );
    const fresh = new ReportQualityDag(store, { reuse: false, mode: 'live' });
    const compute = vi.fn(async () => ({ output: { text: 'second' } }));
    const result = await fresh.run('model-writer-fr', PARENTS, compute, parseText);
    expect(result).toMatchObject({ outcome: 'computed', output: { text: 'second' } });
    const resumed = await dag.run('model-writer-fr', PARENTS, compute, parseText);
    expect(resumed).toMatchObject({ outcome: 'reused', output: { text: 'first' } });
  });

  it('replay-only stops at the first unrecorded node without computing it', async () => {
    const store = new InMemoryArtifactStore();
    const replay = new ReportQualityDag(store, { reuse: true, mode: 'replay-only' });
    const compute = vi.fn(async () => ({ output: { text: 'live' } }));
    await expect(replay.run('model-writer-fr', PARENTS, compute, parseText)).rejects.toThrow(
      ReportQualityReplayMissError,
    );
    expect(compute).not.toHaveBeenCalled();
    expect(() => new ReportQualityDag(store, { reuse: false, mode: 'replay-only' })).toThrow(
      'must reuse',
    );
  });

  it('accepts a deterministic node that reproduces and rejects one that does not', async () => {
    const { dag } = liveDag();
    const parents = { pdfDigest: `sha256:${'6'.repeat(64)}`, tools: 'x' };
    await dag.assertDeterministic('pdf-qa-fr', parents, { gateDigest: 'g1' });
    await dag.assertDeterministic('pdf-qa-fr', parents, { gateDigest: 'g1' });
    await expect(
      dag.assertDeterministic('pdf-qa-fr', parents, { gateDigest: 'g2' }),
    ).rejects.toThrow('different result for identical parents');
    expect(dagNodeKey('pdf-qa-fr', parents)).toBe(dag.nodes[0]!.nodeKey);
  });

  it('stores candidate bytes content-addressed and refuses changed bytes', async () => {
    const { store, dag } = liveDag();
    const bytes = Buffer.from('%PDF-1.7 candidate');
    const stored = await dag.putBytes('candidate-pdf', bytes);
    expect(stored.digest).toBe(bytesDigest(bytes));
    expect(await dag.getBytes(stored.key, stored.digest)).toEqual(bytes);
    await store.put(stored.key, Buffer.from('%PDF-1.7 tampered'));
    await expect(dag.getBytes(stored.key, stored.digest)).rejects.toThrow('missing or changed');
    await expect(
      dag.getBytes('report-quality/dag-bytes/candidate-pdf/none', stored.digest as Sha256Digest),
    ).rejects.toThrow('missing or changed');
  });
});
