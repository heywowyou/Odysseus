import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveMx = vi.fn();
vi.mock('node:dns/promises', () => ({ resolveMx: (domain: string) => resolveMx(domain) }));

const { verifyMailDomain } = await import('./verify-mail-domain.js');

describe('verifyMailDomain', () => {
  beforeEach(() => {
    resolveMx.mockReset();
  });

  it('reports has-mx when the domain publishes an exchanger', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mail.hotel-exemple.fr', priority: 10 }]);
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('has-mx');
  });

  it('reports no-mx for an empty record set', async () => {
    resolveMx.mockResolvedValue([]);
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('no-mx');
  });

  it('reports no-mx for a null MX, which is a zone saying it takes no mail', async () => {
    resolveMx.mockResolvedValue([{ exchange: '', priority: 0 }]);
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('no-mx');
  });

  it.each(['ENODATA', 'ENOTFOUND'])('reports no-mx for %s', async (code) => {
    resolveMx.mockRejectedValue(Object.assign(new Error('nope'), { code }));
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('no-mx');
  });

  it('reports unknown for a transient resolver failure, never no-mx', async () => {
    resolveMx.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }));
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('unknown');
  });

  it('reports unknown for an error carrying no code at all', async () => {
    resolveMx.mockRejectedValue(new Error('something else'));
    await expect(verifyMailDomain('hotel-exemple.fr')).resolves.toBe('unknown');
  });

  it('sends nothing to the mail server, it only reads DNS', async () => {
    resolveMx.mockResolvedValue([{ exchange: 'mail.hotel-exemple.fr', priority: 10 }]);
    await verifyMailDomain('hotel-exemple.fr');
    expect(resolveMx).toHaveBeenCalledExactlyOnceWith('hotel-exemple.fr');
  });
});
