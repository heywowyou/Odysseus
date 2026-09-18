import type { ReportQualityDagNodeRef, ReportQualityModelCall, Sha256Digest } from '@odysseus/core';
import { bytesDigest, canonicalJson, reportQualityDigest } from '@odysseus/report';
import type { ArtifactStore } from '../artifacts/artifact-store.js';

/**
 * Plan 058 §15 content-addressed DAG. Every node's key is the digest of its
 * name and its declared parents (the exact model payload, profile, prompt,
 * schema, images, template, renderer, fonts, tools…), so a stored record can
 * only ever be read back by a run whose dependencies match exactly — any
 * changed parent is a different key, and a stale node is never reachable.
 * A record whose stored key, node or parents disagree with the lookup is
 * corruption and fails closed rather than being recomputed over.
 */

const DAG_VERSION = '058-dag-v1';

export type ReportQualityModelMode = 'live' | 'replay-only';

interface DagRecord {
  dagVersion: string;
  node: string;
  nodeKey: Sha256Digest;
  parents: Record<string, unknown>;
  output: unknown;
  provenance?: ReportQualityModelCall;
}

export interface DagNodeResult<T> {
  output: T;
  provenance?: ReportQualityModelCall;
  outcome: 'computed' | 'reused';
  nodeKey: Sha256Digest;
}

export class ReportQualityDagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportQualityDagError';
  }
}

/** A replay-only run reached a node no earlier run computed. Replay never
 *  calls a provider, so this is the end of what it can prove. */
export class ReportQualityReplayMissError extends ReportQualityDagError {
  constructor(node: string, nodeKey: Sha256Digest) {
    super(`Replay-only run has no recorded ${node} node for ${nodeKey}; no provider is called`);
    this.name = 'ReportQualityReplayMissError';
  }
}

function hex(digest: Sha256Digest): string {
  return digest.slice('sha256:'.length);
}

export function dagNodeKey(node: string, parents: Record<string, unknown>): Sha256Digest {
  return reportQualityDigest({ dagVersion: DAG_VERSION, node, parents });
}

function recordKey(node: string, nodeKey: Sha256Digest): string {
  return `report-quality/dag/${node}/${hex(nodeKey)}.json`;
}

export class ReportQualityDag {
  readonly nodes: ReportQualityDagNodeRef[] = [];
  readonly #store: ArtifactStore;
  readonly #reuse: boolean;
  readonly #mode: ReportQualityModelMode;

  constructor(store: ArtifactStore, options: { reuse: boolean; mode: ReportQualityModelMode }) {
    if (options.mode === 'replay-only' && !options.reuse)
      throw new ReportQualityDagError('A replay-only run must reuse recorded nodes');
    this.#store = store;
    this.#reuse = options.reuse;
    this.#mode = options.mode;
  }

  get mode(): ReportQualityModelMode {
    return this.#mode;
  }

  async #read(node: string, nodeKey: Sha256Digest, parents: Record<string, unknown>) {
    const bytes = await this.#store.get(recordKey(node, nodeKey));
    if (bytes === null) return null;
    let record: DagRecord;
    try {
      record = JSON.parse(bytes.toString('utf8')) as DagRecord;
    } catch {
      throw new ReportQualityDagError(`DAG record ${node}/${nodeKey} is not valid JSON`);
    }
    if (
      record.dagVersion !== DAG_VERSION ||
      record.node !== node ||
      record.nodeKey !== nodeKey ||
      canonicalJson(record.parents) !== canonicalJson(parents) ||
      dagNodeKey(record.node, record.parents) !== nodeKey
    )
      throw new ReportQualityDagError(
        `DAG record ${node}/${nodeKey} does not match its declared parents`,
      );
    return record;
  }

  async #write(record: DagRecord): Promise<void> {
    const key = recordKey(record.node, record.nodeKey);
    // The first record under a key is the one every later run reuses; a
    // no-reuse run that recomputes the node never rewrites it.
    if ((await this.#store.get(key)) !== null) return;
    const bytes = Buffer.from(canonicalJson(record));
    await this.#store.put(key, bytes);
    const back = await this.#store.get(key);
    if (back === null || bytesDigest(back) !== bytesDigest(bytes))
      throw new ReportQualityDagError(`DAG record readback verification failed: ${key}`);
  }

  /** Runs a node, or reuses its recorded output when every parent matches.
   *  A reused output passes through `parse` again, so a record can never
   *  bypass the schema the live output had to satisfy. */
  async run<T>(
    node: string,
    parents: Record<string, unknown>,
    compute: () => Promise<{ output: T; provenance?: ReportQualityModelCall }>,
    parse: (value: unknown) => T,
  ): Promise<DagNodeResult<T>> {
    const nodeKey = dagNodeKey(node, parents);
    if (this.#reuse) {
      const record = await this.#read(node, nodeKey, parents);
      if (record !== null) {
        this.nodes.push({ node, nodeKey, outcome: 'reused' });
        return {
          output: parse(record.output),
          ...(record.provenance ? { provenance: record.provenance } : {}),
          outcome: 'reused',
          nodeKey,
        };
      }
      if (this.#mode === 'replay-only') throw new ReportQualityReplayMissError(node, nodeKey);
    }
    const computed = await compute();
    await this.#write({
      dagVersion: DAG_VERSION,
      node,
      nodeKey,
      parents,
      output: computed.output,
      ...(computed.provenance ? { provenance: computed.provenance } : {}),
    });
    this.nodes.push({ node, nodeKey, outcome: 'computed' });
    return { ...computed, outcome: 'computed', nodeKey };
  }

  /** A deterministic node (exact-PDF QA, rasters) is always recomputed; a
   *  prior record under the same parents that disagrees proves the step is
   *  not deterministic, which fails the run rather than picking one. */
  async assertDeterministic(
    node: string,
    parents: Record<string, unknown>,
    output: unknown,
  ): Promise<Sha256Digest> {
    const nodeKey = dagNodeKey(node, parents);
    const prior = await this.#read(node, nodeKey, parents);
    if (prior !== null && canonicalJson(prior.output) !== canonicalJson(output))
      throw new ReportQualityDagError(
        `Deterministic node ${node} produced a different result for identical parents ${nodeKey}`,
      );
    if (prior === null)
      await this.#write({ dagVersion: DAG_VERSION, node, nodeKey, parents, output });
    this.nodes.push({ node, nodeKey, outcome: 'computed' });
    return nodeKey;
  }

  /** Stores bytes under their own digest (a cached render's PDF). */
  async putBytes(kind: string, bytes: Buffer): Promise<{ digest: Sha256Digest; key: string }> {
    const digest = bytesDigest(bytes);
    const key = `report-quality/dag-bytes/${kind}/${hex(digest)}`;
    const existing = await this.#store.get(key);
    if (existing !== null) {
      if (bytesDigest(existing) !== digest)
        throw new ReportQualityDagError(`Immutable DAG bytes collision: ${key}`);
      return { digest, key };
    }
    await this.#store.put(key, bytes);
    const back = await this.#store.get(key);
    if (back === null || bytesDigest(back) !== digest)
      throw new ReportQualityDagError(`DAG bytes readback verification failed: ${key}`);
    return { digest, key };
  }

  async getBytes(key: string, expected: Sha256Digest): Promise<Buffer> {
    const bytes = await this.#store.get(key);
    if (bytes === null || bytesDigest(bytes) !== expected)
      throw new ReportQualityDagError(`DAG bytes ${key} are missing or changed`);
    return bytes;
  }
}
