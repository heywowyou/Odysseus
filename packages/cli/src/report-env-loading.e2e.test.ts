/**
 * Regression test for a real bug: odysseus report never loaded .env
 * itself, it only worked when some other command's imports (e.g.
 * analyze's @odysseus/llm import) happened to load .env as a side
 * effect first. This spawns the CLI as a real subprocess with
 * MONGODB_URI stripped from the child's environment, so the only way
 * it can see the value is by loading .env itself, the way a fresh
 * terminal running `odysseus report` would.
 *
 * Docker-gated, following packages/store/src/connection.test.ts's
 * pattern: probed once at module load (top-level await) since
 * describe.skipIf must be decided during collection, before any
 * beforeAll hook has run.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '@odysseus/scanner';
import { createReportModel, disconnectFromMongo } from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';

// The test process only uses MONGODB_TEST_URI, which is reserved for test
// databases. It never loads or reads the workspace .env.
const MONGO_URI = process.env['MONGODB_TEST_URI']
  ? scopedMongoTestUri('cli_report_env_loading')
  : undefined;
const TEST_AUDIT_ID = 'test-fixture-report-env-loading';
const WORKSPACE_ROOT = findWorkspaceRoot();
const FIXTURE_SRC = path.join(WORKSPACE_ROOT, 'fixtures/test-audits/small-site');
const CLI_ENTRY = path.join(WORKSPACE_ROOT, 'packages/cli/src/index.ts');
const TSX_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx');
const { available: mongoAvailable, connection: testConnection } = MONGO_URI
  ? await probeMongoAvailability(MONGO_URI)
  : { available: false, connection: undefined };
if (!mongoAvailable) {
  console.warn('[cli e2e] MONGODB_TEST_URI is not reachable. Skipping report env-loading test.');
}

async function deleteTestReportDocs(): Promise<void> {
  if (testConnection === undefined) return;
  await createReportModel(testConnection).deleteMany({ auditId: TEST_AUDIT_ID });
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [CLI_ENTRY, ...args], { cwd: WORKSPACE_ROOT, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe.skipIf(!mongoAvailable)(
  'odysseus report: env loading without an inherited MONGODB_URI',
  () => {
    let tempDir: string;

    beforeAll(async () => {
      // A previous failed run may have left a stale doc behind; clear it
      // before asserting anything, not only after.
      await deleteTestReportDocs();

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-report-env-test-'));
      await fs.cp(FIXTURE_SRC, tempDir, { recursive: true });

      await fs.writeFile(path.join(tempDir, '.env'), `MONGODB_URI=${MONGO_URI}\n`);

      const manifestPath = path.join(tempDir, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { auditId: string };
      manifest.auditId = TEST_AUDIT_ID;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const analysesDir = path.join(tempDir, 'analyses');
      const analysisFiles = await fs.readdir(analysesDir);
      for (const name of analysisFiles) {
        const analysisPath = path.join(analysesDir, name);
        const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8')) as {
          auditId: string;
        };
        analysis.auditId = TEST_AUDIT_ID;
        await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));
      }
    }, 30_000);

    afterAll(async () => {
      await deleteTestReportDocs();
      if (testConnection !== undefined) {
        await testConnection.dropDatabase();
        await disconnectFromMongo(testConnection);
      }
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('loads a test-only env file while MONGODB_URI is absent from the inherited environment', async () => {
      const childEnv = { ...process.env };
      delete childEnv['MONGODB_URI'];
      childEnv['ODYSSEUS_ENV_FILE'] = path.join(tempDir, '.env');

      const result = await runCli(['report', tempDir, '--language', 'fr'], childEnv);

      expect(result.stderr).not.toMatch(/MONGODB_URI is not set/);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`Report for ${TEST_AUDIT_ID} complete`);
    }, 90_000);
  },
);
