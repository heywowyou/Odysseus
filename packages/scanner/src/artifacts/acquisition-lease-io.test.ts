import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertAcquisitionLease,
  StaleAcquisitionLeaseError,
  writeAcquisitionLease,
} from './acquisition-lease-io.js';

const dirs: string[] = [];
function auditDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-lease-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('acquisition lease', () => {
  it('passes for the worker that holds the lease', () => {
    const dir = auditDir();
    writeAcquisitionLease(dir, 'claim-a');
    expect(() => assertAcquisitionLease(dir, 'claim-a')).not.toThrow();
  });

  it('stops the first worker once a second one takes the directory over', () => {
    const dir = auditDir();
    writeAcquisitionLease(dir, 'claim-a');
    writeAcquisitionLease(dir, 'claim-b');
    expect(() => assertAcquisitionLease(dir, 'claim-a')).toThrow(StaleAcquisitionLeaseError);
    expect(() => assertAcquisitionLease(dir, 'claim-b')).not.toThrow();
  });

  it('treats a missing or unreadable lease as held by someone else', () => {
    const dir = auditDir();
    expect(() => assertAcquisitionLease(dir, 'claim-a')).toThrow(StaleAcquisitionLeaseError);
    fs.writeFileSync(path.join(dir, 'acquisition-lease.json'), '{not json');
    expect(() => assertAcquisitionLease(dir, 'claim-a')).toThrow(StaleAcquisitionLeaseError);
  });
});
