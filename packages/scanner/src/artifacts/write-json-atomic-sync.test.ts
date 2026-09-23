import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeJsonAtomicSync } from './write-json-atomic-sync.js';

describe('writeJsonAtomicSync', () => {
  it('writes formatted JSON and atomically replaces the target', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'odysseus-atomic-json-'));
    try {
      const target = path.join(dir, 'manifest.json');
      writeFileSync(target, 'old');

      writeJsonAtomicSync(target, { version: 2 });

      expect(readFileSync(target, 'utf8')).toBe('{\n  "version": 2\n}\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves the previous file intact when the temporary write throws', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'odysseus-atomic-json-'));
    try {
      const target = path.join(dir, 'findings.json');
      writeFileSync(target, '[{"id":"old"}]');
      const writeError = new Error('disk full');
      const fileOps = {
        writeFileSync: vi.fn(() => {
          throw writeError;
        }),
        renameSync: vi.fn(),
        rmSync: vi.fn(),
      };

      expect(() => writeJsonAtomicSync(target, [{ id: 'new' }], fileOps)).toThrow(writeError);
      expect(readFileSync(target, 'utf8')).toBe('[{"id":"old"}]');
      expect(fileOps.renameSync).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
