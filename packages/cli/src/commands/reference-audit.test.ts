import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => ({
  createConfiguredReferenceAuditStore: vi.fn(),
  connectToMongo: vi.fn(),
  disconnectFromMongo: vi.fn(),
  publishReferenceAuditCandidate: vi.fn(),
}));

vi.mock('@odysseus/interface', () => ({
  createConfiguredReferenceAuditStore: mocks.createConfiguredReferenceAuditStore,
  publishReferenceAuditCandidate: mocks.publishReferenceAuditCandidate,
  buildReferenceAuditCandidate: vi.fn(),
  loadReferenceAuditSource: vi.fn(),
}));
vi.mock('@odysseus/store', () => ({
  connectToMongo: mocks.connectToMongo,
  disconnectFromMongo: mocks.disconnectFromMongo,
}));
vi.mock('@odysseus/llm', () => ({ parseWritingOverrideFile: vi.fn() }));

import { registerReferenceAuditCommand } from './reference-audit.js';

let previousExitCode: typeof process.exitCode;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  process.exitCode = previousExitCode;
});

describe('reference-audit publish review gate', () => {
  it('refuses an unreviewed candidate before reading or creating a provider client', async () => {
    const candidateDirectory = path.join(tmpdir(), 'reference-audit-candidate-not-reviewed');
    const program = new Command();
    registerReferenceAuditCommand(program);

    await program.parseAsync(
      ['node', 'odysseus', 'reference-audit', 'publish', candidateDirectory],
      { from: 'node' },
    );

    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to publish without --reviewed'),
    );
    expect(mocks.createConfiguredReferenceAuditStore).not.toHaveBeenCalled();
    expect(mocks.publishReferenceAuditCandidate).not.toHaveBeenCalled();
    expect(mocks.connectToMongo).not.toHaveBeenCalled();
  });
});
