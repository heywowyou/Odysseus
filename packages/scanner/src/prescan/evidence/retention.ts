import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';

export interface PrescanExpirySweepOptions {
  dryRun: boolean;
  limit: number;
  now?: Date;
}

export interface PrescanExpirySweepReport {
  dryRun: boolean;
  inspected: number;
  expired: number;
  removed: number;
  capped: boolean;
  targets: string[];
}

function assertBelowRoot(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside the prescans root: ${target}`);
  }
}

function readExpiry(value: unknown): Date | null {
  if (value === null || typeof value !== 'object') return null;
  const expiresAt = (value as Record<string, unknown>).expiresAt;
  if (typeof expiresAt !== 'string') return null;
  const parsed = new Date(expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function sweepExpiredPrescanArtifacts(
  prescansRoot: string,
  options: PrescanExpirySweepOptions,
): Promise<PrescanExpirySweepReport> {
  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error('Prescan expiry sweep limit must be a positive integer');
  }
  const root = path.resolve(prescansRoot);
  const now = options.now ?? new Date();
  let inspected = 0;
  let expired = 0;
  let removed = 0;
  const targets: string[] = [];
  let capped = false;

  let domains: Dirent[];
  try {
    domains = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { dryRun: options.dryRun, inspected, expired, removed, capped, targets };
    }
    throw error;
  }

  for (const domain of domains
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const domainDir = path.join(root, domain.name);
    const runs = (await fs.readdir(domainDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const run of runs) {
      if (inspected >= options.limit) {
        capped = true;
        break;
      }
      inspected += 1;
      const runDir = path.join(domainDir, run.name);
      assertBelowRoot(root, runDir);
      let expiry: Date | null;
      try {
        expiry = readExpiry(
          JSON.parse(await fs.readFile(path.join(runDir, 'expiry-manifest.json'), 'utf8')),
        );
      } catch {
        continue;
      }
      if (expiry === null || expiry.getTime() > now.getTime()) continue;
      expired += 1;
      targets.push(path.relative(root, runDir));
      if (!options.dryRun) {
        assertBelowRoot(root, runDir);
        await fs.rm(runDir, { recursive: true, force: true });
        removed += 1;
      }
    }
    if (capped) break;
  }

  return { dryRun: options.dryRun, inspected, expired, removed, capped, targets };
}

export async function removePrescanArtifacts(
  prescansRoot: string,
  relativePrescanDir: string,
): Promise<void> {
  if (path.isAbsolute(relativePrescanDir)) {
    throw new Error('Prescan artifact reference must be relative');
  }
  const target = path.resolve(prescansRoot, relativePrescanDir);
  assertBelowRoot(prescansRoot, target);
  await fs.rm(target, { recursive: true, force: true });
}
