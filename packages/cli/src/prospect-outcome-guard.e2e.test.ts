import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '@odysseus/scanner';

const WORKSPACE_ROOT = findWorkspaceRoot();
const CLI_ENTRY = path.join(WORKSPACE_ROOT, 'packages/cli/src/index.ts');
const TSX_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx');

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = {
    ...process.env,
    MONGODB_URI: 'mongodb://127.0.0.1:1/odysseus-outcome-guard-test',
  };
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

describe('odysseus prospect outreach outcome', () => {
  it('rejects an unknown outcome before opening a database connection', async () => {
    const result = await runCli(['prospect', 'outreach', 'outcome', 'thread-1', 'maybe']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unsupported outcome');
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('rejects a lost reason on a non-lost outcome before opening a connection', async () => {
    const result = await runCli([
      'prospect',
      'outreach',
      'outcome',
      'thread-1',
      'won',
      '--lost-reason',
      'budget',
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--lost-reason is valid only with lost');
    expect(result.stderr).not.toContain('ECONNREFUSED');
  }, 60_000);
});
