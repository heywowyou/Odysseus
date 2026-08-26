import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Must match packages/store/src/test-support.ts's MONGO_SKIP_MARKER_PATH -
// duplicated rather than imported so this stays plain JS outside the
// tsc -b project-reference graph.
const MONGO_SKIP_MARKER_PATH = join(tmpdir(), 'odysseus-store-mongo-skip.log');

export default function setup() {
  try {
    rmSync(MONGO_SKIP_MARKER_PATH, { force: true });
  } catch {
    // ignore - nothing to clear
  }

  return () => {
    if (!existsSync(MONGO_SKIP_MARKER_PATH)) return;

    const uris = readFileSync(MONGO_SKIP_MARKER_PATH, 'utf8').split('\n').filter(Boolean);
    if (uris.length > 0) {
      console.warn(
        `[store tests] ${uris.length} store integration test file(s) skipped: Docker MongoDB not reachable at ${uris[0]}. Run "pnpm test:store:up" first.`,
      );
    }

    rmSync(MONGO_SKIP_MARKER_PATH, { force: true });
  };
}
