import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  getHotelCandidate,
  getProspectEvidenceAssetSource,
  getProspectEvidenceView,
  getProspectPreviewView,
  getProspectPrescanView,
  getProspectScoreDiffView,
  getProspectScoreView,
  getVendorFingerprintAggregate,
} from '@odysseus/store';
import { buildArtifactBucketKey, getPrescansRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { sendError, sendJson } from '../http-utils.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';

/** Plan 013 slice 3 owns this module: prescan, score, evidence, preview
 *  inspection, and vendor aggregate views. Routes here must call
 *  operator-views store helpers, never query Mongoose models directly, and
 *  every response body is the store view unchanged: the projections already
 *  exclude token hashes, object keys, artifact paths, and address material,
 *  and this boundary never adds any of it back. */

/** Issue #92: URL names for the two evidence assets, kebab-case forms of the
 *  store's evidence field names. The JSON evidence view keeps carrying no
 *  artifact address; the bytes are what this endpoint hands over. */
const EVIDENCE_ASSET_SLOTS: Record<string, 'renderComparison' | 'specificFailure'> = {
  'render-comparison': 'renderComparison',
  'specific-failure': 'specificFailure',
};

/** Candidate ids, prescan versions and scoring versions are opaque tokens at
 *  this boundary: non-empty, bounded, and free of whitespace and control
 *  characters, the same early shape check scans.ts applies to globs. Whether
 *  the token names a real record is the store's answer, reported as 404. */
function isPlausibleToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\s\x00-\x1f]/.test(value)
  );
}

/** Reads and validates one query parameter as a positive whole number.
 *  Value undefined when absent, so the store helper keeps its own default. */
function parsePositiveIntQuery(
  query: URLSearchParams,
  key: string,
): { ok: true; value: number | undefined } | { ok: false; error: string } {
  const raw = query.get(key);
  if (raw === null) return { ok: true, value: undefined };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, error: `${key} must be a positive whole number` };
  }
  return { ok: true, value: parsed };
}

function requireCandidateId(params: Record<string, string>): string | null {
  const candidateId = params['candidateId']!;
  return isPlausibleToken(candidateId) ? candidateId : null;
}

export function registerProspectInsightRoutes(router: Router, connection: Connection): void {
  // Issue #63: built once, since a caller with no bucket configured must
  // never pay a per-request cost for constructing one, and both readers
  // below share the same fallback behaviour.
  const artifactStore: ArtifactStore | undefined = createConfiguredArtifactStore();
  router.get('/api/prospects/:candidateId/prescan', async ({ res, params }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    const view = await getProspectPrescanView(connection, candidateId);
    if (view === null) {
      sendError(res, 404, 'no prescan found for this candidate');
      return;
    }
    sendJson(res, 200, view);
  });

  router.get('/api/prospects/:candidateId/score', async ({ res, params }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    const view = await getProspectScoreView(connection, candidateId);
    if (view === null) {
      sendError(res, 404, 'no score found for this candidate');
      return;
    }
    sendJson(res, 200, view);
  });

  router.get('/api/prospects/:candidateId/score/diff', async ({ res, params, query }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    // Both versions are required: a one-sided diff would silently compare
    // against whatever the route picked, and a missing score is rendered
    // downstream as an absent side, never as a zero.
    const fromVersion = query.get('from');
    const toVersion = query.get('to');
    if (!isPlausibleToken(fromVersion)) {
      sendError(res, 400, 'from must be a scoring version');
      return;
    }
    if (!isPlausibleToken(toVersion)) {
      sendError(res, 400, 'to must be a scoring version');
      return;
    }
    // A diff of an unknown candidate has no row to show, while a diff of a
    // known candidate may legitimately miss one side; the candidate lookup
    // is what tells those two cases apart.
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendError(res, 404, 'candidate not found');
      return;
    }
    const diff = await getProspectScoreDiffView(connection, candidateId, fromVersion, toVersion);
    sendJson(res, 200, diff);
  });

  router.get('/api/prospects/:candidateId/evidence', async ({ res, params }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    const view = await getProspectEvidenceView(connection, candidateId);
    if (view === null) {
      sendError(res, 404, 'no evidence found for this candidate');
      return;
    }
    sendJson(res, 200, view);
  });

  // Issue #92: the two evidence screenshots themselves. The JSON view above
  // deliberately carries no artifact address, so the bytes travel through
  // their own endpoint, resolved through the same local-first, bucket-second
  // path as the report PDFs (issue #63). A sha256 mismatch answers 409: the
  // operator sees an explicit unavailable state, never bytes the record did
  // not vouch for. The response is operator-only content, so it is served
  // with nosniff and no shared caching.
  router.get('/api/prospects/:candidateId/evidence/assets/:slot', async ({ res, params }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    const slot = EVIDENCE_ASSET_SLOTS[params['slot'] ?? ''];
    if (slot === undefined) {
      sendError(res, 400, 'slot must be "render-comparison" or "specific-failure"');
      return;
    }
    const source = await getProspectEvidenceAssetSource(connection, candidateId, slot);
    if (source === null) {
      sendError(res, 404, 'no captured evidence asset for this slot');
      return;
    }
    const localPath = path.resolve(getPrescansRoot(), source.artifactsDir, source.ref);
    const bucketKey = buildArtifactBucketKey(source.domain, source.startedAt, source.ref);
    let png: Buffer;
    try {
      png = await resolveArtifactFile(localPath, bucketKey, artifactStore);
    } catch {
      sendError(res, 404, 'evidence asset not found on disk or in the bucket');
      return;
    }
    const digest = createHash('sha256').update(png).digest('hex');
    if (digest !== source.sha256) {
      sendError(res, 409, 'evidence asset digest does not match its provenance record');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, no-store');
    res.end(png);
  });

  router.get('/api/prospects/:candidateId/preview', async ({ res, params }) => {
    const candidateId = requireCandidateId(params);
    if (candidateId === null) {
      sendError(res, 400, 'candidateId must be a non-empty identifier');
      return;
    }
    const view = await getProspectPreviewView(connection, candidateId);
    if (view === null) {
      sendError(res, 404, 'no preview found for this candidate');
      return;
    }
    // Status and dates only. The public link is a bearer URL built from a
    // raw token that publication returned exactly once and never stored, so
    // the operator surface cannot reconstruct it and must not guess at it.
    sendJson(res, 200, view);
  });

  router.get('/api/vendors', async ({ res, query }) => {
    // The prescan generation is pinned server-side to the same constant the
    // prescan job and the CLI default to, so the aggregate always describes
    // the current scan generation; only the group size threshold is a
    // caller choice, and every other query parameter is a typo.
    for (const key of query.keys()) {
      if (key !== 'minimumGroupSize') {
        sendError(res, 400, `unknown query parameter "${key}"`);
        return;
      }
    }
    const groupSize = parsePositiveIntQuery(query, 'minimumGroupSize');
    if (!groupSize.ok) {
      sendError(res, 400, groupSize.error);
      return;
    }
    const aggregate = await getVendorFingerprintAggregate(
      connection,
      CURRENT_PRESCAN_VERSION,
      groupSize.value,
    );
    sendJson(res, 200, aggregate);
  });
}
