import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_ROUTE_PREFIXES } from './app-routes.js';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

describe('APP_ROUTE_PREFIXES', () => {
  it('covers every top-level route dashboard/App.tsx declares', async () => {
    const appSource = await readFile(path.join(packageRoot, 'dashboard/App.tsx'), 'utf-8');
    const topLevelPaths = [...appSource.matchAll(/<Route path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((routePath): routePath is string => routePath !== undefined && routePath !== '*')
      .map((routePath) => routePath.split('/')[0] ?? routePath);

    for (const prefix of new Set(topLevelPaths)) {
      expect(APP_ROUTE_PREFIXES).toContain(prefix);
    }
  });
});
