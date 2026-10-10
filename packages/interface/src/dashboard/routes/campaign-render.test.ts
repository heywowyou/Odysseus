// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { CAMPAIGN_FIXTURE } from './campaign-fixture';
import { CampaignPage } from './campaign';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(
  response: () => Response | Promise<Response>,
  options: { path?: string; language?: 'fr' | 'en' } = {},
): Promise<{ container: HTMLElement; root: Root }> {
  window.localStorage.setItem('odysseus.dashboard.language', options.language ?? 'fr');
  vi.stubGlobal('fetch', vi.fn(response));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: [options.path ?? '/campagne'] },
          createElement(CampaignPage),
        ),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { container, root };
}

const ok = (body: unknown) => (): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function tiles(container: HTMLElement): { label: string; value: string }[] {
  return [...container.querySelectorAll('dl.grid > div')].map((tile) => ({
    label: tile.querySelector('dt')?.textContent ?? '',
    value: tile.querySelector('dd')?.textContent ?? '',
  }));
}

function card(container: HTMLElement, heading: string): HTMLElement {
  const title = [...container.querySelectorAll('h2')].find((h2) => h2.textContent === heading);
  if (!title) throw new Error(`card "${heading}" was not rendered`);
  return title.closest('section')!;
}

describe('campaign page (plan 078)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows every block of the selected campaign', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-10T09:00:00.000Z') });
    const { container, root } = await render(ok({ campaigns: [CAMPAIGN_FIXTURE] }));

    expect(container.querySelector('h1')?.textContent).toBe('Campagne');
    expect(container.textContent).toContain(
      'Campagne first-100-2026-09 · premier envoi le 24 sept. 2026',
    );
    expect(tiles(container)).toEqual([
      { label: 'Premiers emails délivrés', value: '59' },
      { label: 'Arrivés à maturité', value: '34' },
      { label: 'Réponses', value: '6' },
      { label: 'Ventes', value: '1' },
    ]);
    expect(container.textContent).toContain('Rebonds exclus : 2');
    expect(container.textContent).toContain('Positives : 2 · Désinscriptions : 1');

    // The strip is decoration: every count it draws is written in its legend.
    const standing = card(container, 'Où en sont les prospects');
    expect(standing.querySelector('[aria-hidden="true"]')).not.toBeNull();
    const legend = [...standing.querySelectorAll('dl > div')].map(
      (entry) =>
        `${entry.querySelector('dt')?.textContent}: ${entry.querySelector('dd')?.textContent}`,
    );
    expect(legend).toEqual([
      'Ont répondu: 6',
      'Séquence close sans réponse: 28',
      'Délai de réponse en cours après le troisième email: 7',
      'Séquence en cours: 18',
    ]);
    expect(standing.textContent).toContain(
      'Prochaine arrivée à maturité : le 12 oct. 2026 au plus tôt. Dans les 7 prochains jours : 7 fil(s).',
    );

    const checkpoints = card(container, 'Points de contrôle');
    const rows = [...checkpoints.querySelectorAll('li')];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('34 / 100');
    expect(rows[0]!.textContent).toContain(
      'Estimation : 1 déc. 2026, au rythme de 2 premier(s) email(s) par jour',
    );
    expect(rows[1]!.textContent).toContain('Pas d’estimation');
    expect(rows[0]!.textContent).toContain('Règle du projet');
    expect(rows[0]!.textContent).toContain(
      'Mesuré à ce jour : 6 réponse(s), dont 2 positive(s) ; 1 vente(s).',
    );
    expect(rows[0]!.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
      '34 sur 100 premiers emails arrivés à maturité',
    );

    const replies = card(container, 'Réponses');
    expect(replies.textContent).toContain('Premier email4');
    expect(replies.textContent).toContain('A compris une autre offre2');
    expect(replies.textContent).toContain('Non renseigné1');

    const segments = card(container, 'Par segment');
    const segmentRows = [...segments.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent?.replace(/\s/gu, ' ')),
    );
    expect(segmentRows).toEqual([
      ['3 étoiles', '37', '22', '5', '2', '22,7 %'],
      ['4 étoiles', '19', '11', '1', '0', '1 / 11'],
      ['Inconnu', '3', '1', '0', '0', '0 / 1'],
    ]);
    expect(segments.querySelectorAll('thead th[scope="col"]')).toHaveLength(6);
    expect(segments.querySelectorAll('tbody th[scope="row"]')).toHaveLength(3);

    expect(container.textContent).toContain(
      'Premiers emails fusionnés dans le message d’un autre prospect, comptés une seule fois : 1.',
    );
    act(() => root.unmount());
  });

  it('switches the segment table to another stored facet', async () => {
    const { container, root } = await render(ok({ campaigns: [CAMPAIGN_FIXTURE] }));
    const facet = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Accessibilité dans l’aperçu',
    );
    await act(async () => {
      facet!.click();
    });
    const first = card(container, 'Par segment').querySelector('tbody tr');
    expect(first?.textContent).toContain('Accessibilité parmi les trois cartes');
    expect(first?.textContent).toContain('41');
    act(() => root.unmount());
  });

  it('dates a checkpoint the sent emails will reach, and one already reached', async () => {
    const { container, root } = await render(
      ok({
        campaigns: [
          {
            ...CAMPAIGN_FIXTURE,
            checkpoints: [
              {
                checkpoint: 100,
                kind: 'reached',
                reachedOn: { day: '2026-10-08', replies: 5, positiveReplies: 2 },
              },
              { checkpoint: 300, kind: 'dated', day: '2026-11-03' },
              { checkpoint: 500, kind: 'reached' },
            ],
          },
        ],
      }),
      { language: 'en' },
    );
    const rows = [...card(container, 'Checkpoints').querySelectorAll('li')].map(
      (row) => row.textContent ?? '',
    );
    expect(rows[0]).toContain('Reached on 8 Oct 2026');
    expect(rows[0]).toContain('That day: 5 reply(ies), of which 2 positive.');
    expect(rows[1]).toContain('3 Nov 2026 at the earliest');
    expect(rows[1]).not.toContain('Estimate');
    expect(rows[2]).toContain('The daily record does not give its date yet.');
    act(() => root.unmount());
  });

  it('shows a failed load as unavailable, never as zero', async () => {
    const { container, root } = await render(() => {
      throw new Error('network down');
    });

    const shown = tiles(container);
    expect(shown).toHaveLength(4);
    for (const tile of shown) {
      expect(tile.value).toBe('Indisponible');
      expect(tile.value).not.toContain('0');
    }
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toContain(
      'Réessayer',
    );
    expect(container.querySelectorAll('h2')).toHaveLength(0);
    act(() => root.unmount());
  });

  it('says so when no first email was sent', async () => {
    const { container, root } = await render(ok({ campaigns: [] }));
    expect(container.textContent).toContain('Aucun premier email envoyé');
    expect(tiles(container)).toHaveLength(0);
    act(() => root.unmount());
  });

  it('offers a campaign switch only when there are several, and follows the URL', async () => {
    const second = { ...CAMPAIGN_FIXTURE, campaignVersion: 'batch-2', won: 7 };
    const { container, root } = await render(ok({ campaigns: [CAMPAIGN_FIXTURE, second] }), {
      path: '/campagne?campagne=batch-2',
    });
    expect(container.querySelector('[aria-label="Campagne affichée"]')).not.toBeNull();
    expect(tiles(container).at(-1)).toEqual({ label: 'Ventes', value: '7' });
    act(() => root.unmount());

    const single = await render(ok({ campaigns: [CAMPAIGN_FIXTURE] }));
    expect(single.container.querySelector('[aria-label="Campagne affichée"]')).toBeNull();
    act(() => single.root.unmount());
  });
});
