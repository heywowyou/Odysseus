// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { WaveDialog } from './wave-dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('WaveDialog', () => {
  it('prefills a removal with the candidate current wave', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(WaveDialog, {
            open: true,
            onOpenChange: () => {},
            mode: 'remove',
            candidateId: 'cand-1',
            hotelName: 'Hôtel Exemple',
            initialWave: 'wave-130926',
            onSubmit: async () => {},
          }),
        ),
      );
    });

    expect(document.querySelector('input')?.value).toBe('wave-130926');
    await act(async () => root.unmount());
  });
});
