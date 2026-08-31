import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  parseDashboardPasswordHash,
  SCRYPT_KEY_LENGTH_BYTES,
  verifyDashboardPassword,
} from './password.js';

const scrypt = promisify(scryptCallback);
const PASSWORD = 'correct horse battery staple';

async function makeConfiguredHash(
  password: string,
  keyLengthBytes = SCRYPT_KEY_LENGTH_BYTES,
): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, keyLengthBytes);
  return `${salt.toString('hex')}:${(hash as Buffer).toString('hex')}`;
}

describe('parseDashboardPasswordHash', () => {
  it('splits a well-formed value into its binary halves', () => {
    const parsed = parseDashboardPasswordHash('aabbcc:0102');
    expect(parsed).not.toBeNull();
    expect(parsed?.salt.toString('hex')).toBe('aabbcc');
    expect(parsed?.expectedHash.toString('hex')).toBe('0102');
  });

  it.each([
    [''],
    ['odysseus'],
    [':abcd'],
    ['abcd:'],
    ['zz:zz'],
    ['a:b'],
    ['a:b:c'],
    ['abcd:ef:gh'],
  ])('fails closed on the malformed value %j', (configured) => {
    expect(parseDashboardPasswordHash(configured)).toBeNull();
  });
});

describe('verifyDashboardPassword', () => {
  it('accepts the password a configured hash was made from', async () => {
    const configured = await makeConfiguredHash(PASSWORD);
    await expect(verifyDashboardPassword(configured, PASSWORD)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const configured = await makeConfiguredHash(PASSWORD);
    await expect(verifyDashboardPassword(configured, 'wrong horse')).resolves.toBe(false);
  });

  it('rejects a tampered hash segment', async () => {
    const configured = await makeConfiguredHash(PASSWORD);
    const tampered = `${configured.slice(0, -2)}00`;
    await expect(verifyDashboardPassword(tampered, PASSWORD)).resolves.toBe(false);
  });

  it('rejects a hash derived with a different key length', async () => {
    const short = await makeConfiguredHash(PASSWORD, 32);
    await expect(verifyDashboardPassword(short, PASSWORD)).resolves.toBe(false);
  });

  it.each(['', 'odysseus', 'zz:zz'])(
    'fails closed without throwing on the malformed config %j',
    async (configured) => {
      await expect(verifyDashboardPassword(configured, PASSWORD)).resolves.toBe(false);
    },
  );
});
