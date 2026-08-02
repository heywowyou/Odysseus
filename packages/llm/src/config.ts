/**
 * Deliberately duplicates packages/scanner/src/config.ts's
 * findWorkspaceRoot/ensureEnvLoaded pattern by value, not by import:
 * packages/llm must not depend on packages/scanner (llm is a peer of
 * scanner, not a consumer of it). packages/core's manifest.ts documents
 * the same kind of intentional small duplication for the same reason
 * (packages/core must not depend on packages/scanner either). Keep the
 * two copies in sync by hand.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function findWorkspaceRoot(): string {
  let dir = moduleDir;
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `odysseus: could not locate the workspace root (no pnpm-workspace.yaml found above ${moduleDir})`,
      );
    }
    dir = parent;
  }
}

let envLoaded = false;

/** Populates process.env from .env as a side effect. Calling this early
 *  (via getAnthropicApiKey) also makes a later getMongoUri() call
 *  succeed, since getMongoUri() does not trigger env loading itself. */
export function ensureEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile(path.join(findWorkspaceRoot(), '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Reads ANTHROPIC_API_KEY from the environment, loading .env first.
 *  Throws a clear, loud error if unset rather than letting the SDK fail
 *  later with an opaque auth error, matching getMongoUri()'s style in
 *  packages/store/src/connection.ts. */
export function getAnthropicApiKey(): string {
  ensureEnvLoaded();
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    throw new Error(
      'odysseus: ANTHROPIC_API_KEY is not set. Set it in the environment or in .env before running a command that calls the Claude API.',
    );
  }
  return key;
}
