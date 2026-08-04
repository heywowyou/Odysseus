import path from 'node:path';
import { ensureEnvLoaded, findWorkspaceRoot } from '@odysseus/scanner';

export const DEFAULT_INTERFACE_PORT = 4600;
/** Binds to loopback only by default: this is what makes the dashboard a
 *  *private* interface rather than the "public web interface" CLAUDE.md
 *  says isn't being built. Reachable from another machine only if the
 *  operator deliberately tunnels to it themselves. */
export const DEFAULT_INTERFACE_HOST = '127.0.0.1';
/** Each concurrent job needs its own Chromium + Lighthouse CDP pairing
 *  (see browser.ts); default 1 is the safe floor for a solo operator's
 *  own machine, per CLAUDE.md's "cap concurrency, provision for what the
 *  machine can host" guidance. 2 is offered, not recommended, for a
 *  machine known to have the memory to spare. */
export const DEFAULT_QUEUE_CONCURRENCY = 1;
/** Prospecting is bounded to a homepage-only pass in milestone 7 (no
 *  brokenness scoring or ranked table yet - see docs/llm-layer-rules.md
 *  section 10, not implemented). This ceiling is enforced server-side
 *  regardless of what a request asks for. */
export const PROSPECTING_MAX_PAGES = 1;
export const PROSPECTING_MAX_DEPTH = 0;

export function getInterfacePort(): number {
  ensureEnvLoaded();
  const raw = process.env['ODYSSEUS_INTERFACE_PORT'];
  if (!raw) return DEFAULT_INTERFACE_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERFACE_PORT;
}

export function getInterfaceHost(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_INTERFACE_HOST'] || DEFAULT_INTERFACE_HOST;
}

export function getQueueConcurrency(): number {
  ensureEnvLoaded();
  const raw = process.env['QUEUE_CONCURRENCY'];
  if (!raw) return DEFAULT_QUEUE_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUEUE_CONCURRENCY;
}

/** Anchored to the workspace root (not to this module's own depth on
 *  disk), so it resolves identically whether the server runs via `tsx
 *  src/index.ts` (dev) or the compiled `dist/index.js` (prod) - both sit
 *  at different depths relative to `src/public`, but findWorkspaceRoot
 *  doesn't care which one is running. */
export function getPublicDir(): string {
  return path.join(findWorkspaceRoot(), 'packages', 'interface', 'dist', 'public');
}
