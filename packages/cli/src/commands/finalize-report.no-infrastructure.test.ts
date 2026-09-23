import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { RenderBundle } from '@odysseus/report';

const mocks = vi.hoisted(() => ({
  applyOverridesToBundle: vi.fn(),
  generateReportPdfVariants: vi.fn(),
  parseWritingOverrideFile: vi.fn(),
  readOdysseusBuildId: vi.fn(),
  readRenderBundleDir: vi.fn(),
  reportPageCountWarning: vi.fn(),
}));

vi.mock('@odysseus/report', () => ({
  applyOverridesToBundle: mocks.applyOverridesToBundle,
  generateReportPdfVariants: mocks.generateReportPdfVariants,
  readRenderBundleDir: mocks.readRenderBundleDir,
  REPORT_TEMPLATE_VERSION: 7,
  reportPageCountWarning: mocks.reportPageCountWarning,
}));
vi.mock('@odysseus/llm', () => ({ parseWritingOverrideFile: mocks.parseWritingOverrideFile }));
vi.mock('@odysseus/scanner', () => ({ readOdysseusBuildId: mocks.readOdysseusBuildId }));
vi.mock('@odysseus/store', () => {
  throw new Error('report:finalize must not load the database package');
});
vi.mock('@odysseus/interface', () => {
  throw new Error('report:finalize must not load provider clients');
});

import { registerFinalizeReportCommand } from './finalize-report.js';

const bundle = {
  lineage: { auditId: 'audit-offline', language: 'fr', analysisId: 'analysis-offline' },
  manifest: { auditId: 'audit-offline', startedAt: '2026-09-01T00:00:00.000Z' },
  findings: [],
  analysis: { analysisId: 'analysis-offline', generatedAt: new Date('2026-09-01T00:00:00.000Z') },
} as unknown as RenderBundle;

let temporaryDirectory: string;
let previousExitCode: typeof process.exitCode;
let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  vi.resetAllMocks();
  mocks.readRenderBundleDir.mockResolvedValue(bundle);
  mocks.generateReportPdfVariants.mockResolvedValue({
    dark: { pdf: Buffer.from('%PDF-offline'), pageCount: 2 },
  });
  mocks.parseWritingOverrideFile.mockReturnValue({ overrides: [] });
  mocks.readOdysseusBuildId.mockReturnValue('offline-test-build');
  mocks.reportPageCountWarning.mockReturnValue(undefined);
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  consoleLog.mockRestore();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
  process.exitCode = previousExitCode;
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

async function runFinalize(args: string[]): Promise<void> {
  const program = new Command();
  registerFinalizeReportCommand(program);
  await program.parseAsync(['node', 'odysseus', 'report:finalize', ...args], { from: 'node' });
}

describe('report:finalize stays offline', () => {
  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'finalize-report-offline-'));
  });

  it('renders a bundle locally without loading MongoDB or provider clients', async () => {
    const output = path.join(temporaryDirectory, 'nested', 'final.pdf');

    await runFinalize(['--bundle', path.join(temporaryDirectory, 'bundle'), '--out', output]);

    await expect(fs.readFile(output)).resolves.toEqual(Buffer.from('%PDF-offline'));
    expect(mocks.readRenderBundleDir).toHaveBeenCalledTimes(1);
    expect(mocks.generateReportPdfVariants).toHaveBeenCalledTimes(1);
  });

  it('refuses an invalid reviewed override before rendering a PDF', async () => {
    const overridePath = path.join(temporaryDirectory, 'overrides.json');
    await fs.writeFile(overridePath, '{}');
    mocks.applyOverridesToBundle.mockReturnValue({
      status: 'refused',
      reason: 'the override does not match the fetched analysis',
    });

    await runFinalize([
      '--bundle',
      path.join(temporaryDirectory, 'bundle'),
      '--overrides',
      overridePath,
      '--out',
      path.join(temporaryDirectory, 'final.pdf'),
    ]);

    expect(process.exitCode).toBe(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('the override does not match the fetched analysis'),
    );
    expect(mocks.generateReportPdfVariants).not.toHaveBeenCalled();
  });
});
