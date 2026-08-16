import { describe, expect, it } from 'vitest';
import { getEnabledNafCodes, getNafSectorAllowlist } from './naf-allowlist.js';

describe('getNafSectorAllowlist', () => {
  it('loads the real shipped config', () => {
    const allowlist = getNafSectorAllowlist();
    expect(allowlist.version).toBeTruthy();
    expect(allowlist.codes.length).toBeGreaterThan(0);
  });

  it('marks 47.91A and 47.91B as definitional and enabled', () => {
    const allowlist = getNafSectorAllowlist();
    const definitional = allowlist.codes.filter((entry) => ['47.91A', '47.91B'].includes(entry.code));
    expect(definitional).toHaveLength(2);
    for (const entry of definitional) {
      expect(entry.confidence).toBe('definitional');
      expect(entry.enabled).toBe(true);
    }
  });

  it('never enables an inferred-confidence code by default', () => {
    const allowlist = getNafSectorAllowlist();
    const inferred = allowlist.codes.filter((entry) => entry.confidence === 'inferred');
    expect(inferred.length).toBeGreaterThan(0);
    for (const entry of inferred) {
      expect(entry.enabled).toBe(false);
    }
  });

  it('getEnabledNafCodes returns exactly the enabled codes', () => {
    const allowlist = getNafSectorAllowlist();
    const expected = new Set(allowlist.codes.filter((entry) => entry.enabled).map((entry) => entry.code));
    expect(getEnabledNafCodes()).toEqual(expected);
  });
});
