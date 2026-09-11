/**
 * Publishing a preview puts a document in front of a prospect and revoking one
 * takes it back, so the arguments that decide which is which must be rejected
 * before anything is connected, written, or served.
 *
 * Same shape and same reasoning as prospect-contacts-guard.e2e.test.ts: the
 * child's MONGODB_URI points at a port nothing listens on, so any path that
 * reached the database would fail with a connection error rather than the
 * message asserted here.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '@odysseus/scanner';

const WORKSPACE_ROOT = findWorkspaceRoot();
const CLI_ENTRY = path.join(WORKSPACE_ROOT, 'packages/cli/src/index.ts');
const TSX_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx');

const UNREACHABLE_MONGO = 'mongodb://127.0.0.1:1/odysseus-preview-guard-test';

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [CLI_ENTRY, ...args], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, MONGODB_URI: UNREACHABLE_MONGO },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('odysseus prospect preview', () => {
  it('rejects an unsupported language before opening a connection', async () => {
    const result = await runCli(['prospect', 'preview', 'publish', 'cand-1', '--language', 'de']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--language must be fr or en');
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('documents all three subcommands and the dry run', async () => {
    const groupHelp = await runCli(['prospect', 'preview', '--help']);
    expect(groupHelp.code).toBe(0);
    for (const subcommand of ['publish', 'revoke', 'list']) {
      expect(groupHelp.stdout).toContain(subcommand);
    }

    const publishHelp = await runCli(['prospect', 'preview', 'publish', '--help']);
    expect(publishHelp.code).toBe(0);
    expect(publishHelp.stdout).toContain('--dry-run');
    // Since plan 037 the prescan-backed publish path is retired: someone
    // running it for the first time should learn that from the help itself,
    // along with where the live path moved, rather than from a refusal code.
    expect(publishHelp.stdout).toContain('Retired by plan 037');
    expect(publishHelp.stdout).toContain('audit detail page');
  }, 60_000);

  it('offers one command that both withdraws the preview and suppresses the domain', async () => {
    // Two commands would mean doing one of them and forgetting the other on the
    // day it matters, which is the day somebody objects.
    const help = await runCli(['prospect', 'object', '--help']);

    expect(help.code).toBe(0);
    expect(help.stdout).toContain('withdraw every live preview');
    expect(help.stdout).toContain('permanent suppression entry');
    expect(help.stdout).toContain('Only hashes are stored');
  }, 60_000);

  it('keeps the standalone suppression command, which needs no bucket', async () => {
    const help = await runCli(['prospect', 'suppress', '--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('permanent opt-out');
  }, 60_000);
});
