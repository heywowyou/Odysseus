/**
 * Plan 011's guarantee is that the program can prepare a message and cannot
 * send one. Most of that guarantee is enforced one layer down, in the mailbox
 * port's shape, but the command line is where a person actually looks for a
 * capability - so if a send verb ever appears anywhere in this group's help
 * text, that is the moment to catch it.
 *
 * Same shape and same reasoning as prospect-preview-guard.e2e.test.ts: the
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

const UNREACHABLE_MONGO = 'mongodb://127.0.0.1:1/odysseus-draft-guard-test';

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<SpawnResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, MONGODB_URI: UNREACHABLE_MONGO };
  // No mailbox is provisioned yet, and these tests must describe that state
  // rather than whatever happens to be in the developer's shell.
  for (const key of Object.keys(env)) {
    if (key.startsWith('ODYSSEUS_MAILBOX_')) delete env[key];
  }
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

const SEND_VERBS = ['send', 'envoyer', 'dispatch', 'deliver'];

describe('odysseus prospect draft', () => {
  it('offers no command that could send, and names none in its help', async () => {
    const help = await runCli(['prospect', 'draft', '--help']);
    expect(help.code).toBe(0);

    // The listed subcommands are the whole surface. A send verb reaching this
    // list is the failure this file exists to make loud.
    const commandLines = help.stdout
      .split('\n')
      .slice(help.stdout.split('\n').findIndex((line) => line.startsWith('Commands:')) + 1);
    for (const verb of SEND_VERBS) {
      expect(commandLines.join('\n').toLowerCase()).not.toContain(`  ${verb} `);
    }

    const unknown = await runCli(['prospect', 'draft', 'send', 'cand-1']);
    expect(unknown.code).not.toBe(0);
  }, 60_000);

  it('documents all five subcommands', async () => {
    const help = await runCli(['prospect', 'draft', '--help']);
    for (const subcommand of ['create', 'batch', 'list', 'show', 'delete']) {
      expect(help.stdout).toContain(subcommand);
    }
  }, 60_000);

  it('rejects an unsupported language before opening a connection', async () => {
    const result = await runCli(['prospect', 'draft', 'create', 'cand-1', '--language', 'de']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--language must be fr or en');
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('refuses a real run with no mailbox configured, naming what is missing', async () => {
    const result = await runCli(['prospect', 'draft', 'create', 'cand-1']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no mailbox is configured');
    expect(result.stderr).toContain('ODYSSEUS_MAILBOX_');
    // Refused before connecting, so an operator sees the real cause rather
    // than a database error standing in front of it.
    expect(result.stderr).not.toContain('ECONNREFUSED');
    // And it never prints a value, only the names of the variables to set.
    expect(result.stderr).not.toContain('refresh_token');
  }, 60_000);

  it('requires an explicit limit on a batch', async () => {
    const result = await runCli(['prospect', 'draft', 'batch', '--dry-run']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('--limit');
  }, 60_000);

  it('says plainly, in the group description, that nothing here sends', async () => {
    const help = await runCli(['prospect', '--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('draft');
  }, 60_000);
});
