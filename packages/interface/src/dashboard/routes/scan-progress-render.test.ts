// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ScanProgressPage } from './scan-progress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const pushbackJob = {
  jobId: 'job-1',
  type: 'full-audit',
  status: 'running',
  outcomeCode: 'running',
  reportFailureStage: null,
  coverageGateBlocked: false,
  phase: 'crawl',
  siteUrl: 'https://example.com/',
  createdAt: '2026-09-22T10:00:00.000Z',
  progress: {
    crawl: { visited: 2, target: 10, effectiveDelayMs: 2000 },
    pushbackEvents: [
      {
        pageUrl: 'https://example.com/products',
        kind: 'rate-limit',
        fetcher: 'crawl',
        status: 429,
        retryAfterMs: 7000,
        occurredAt: '2026-09-22T10:00:01.000Z',
      },
      {
        pageUrl: 'https://example.com/products',
        kind: 'bot-challenge',
        fetcher: 'render',
        occurredAt: '2026-09-22T10:00:02.000Z',
      },
    ],
  },
  options: { delayMs: 2000, scanConcurrency: 2 },
  work: {
    workId: 'job-1',
    owner: 'legacy-job',
    purpose: 'full-scan',
    state: 'running',
    subject: {},
    createdAt: '2026-09-22T10:00:00.000Z',
    updatedAt: '2026-09-22T10:00:02.000Z',
  },
  capabilities: {
    cancel: { state: 'available', stateToken: 'cancel-1' },
    delete: { state: 'blocked', stateToken: 'delete-1', reasonCode: 'work-running' },
  },
};

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
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
          { initialEntries: ['/scans/job-1'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: 'scans/:jobId',
              element: createElement(ScanProgressPage),
            }),
          ),
        ),
      ),
    );
  });
  return { container, root };
}

async function waitForText(container: HTMLElement, text: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error(`Expected dashboard text was not rendered: ${text}`);
}

const cappedPushbackJob = {
  ...pushbackJob,
  progress: {
    ...pushbackJob.progress,
    pushbackEvents: [
      {
        pageUrl: 'https://example.com/products',
        kind: 'bot-challenge',
        fetcher: 'crawl',
        occurredAt: '2026-09-22T10:00:01.000Z',
        delayMs: 60_000,
        atMaxDelay: false,
      },
      {
        pageUrl: 'https://example.com/rooms',
        kind: 'bot-challenge',
        fetcher: 'crawl',
        occurredAt: '2026-09-22T10:05:00.000Z',
        delayMs: 60_000,
        atMaxDelay: true,
      },
    ],
  },
};

function relaunchLink(container: HTMLElement): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find(
    (link) => link.textContent?.trim() === 'Relancer plus lentement',
  );
}

describe('scan progress pushback notice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('says the scan slowed itself down, without asking for a relaunch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(pushbackJob)),
    );
    const { container, root } = await renderPage();

    await waitForText(container, 'Réactions du site à nos requêtes : 2.');
    expect(relaunchLink(container)).toBeUndefined();

    root.unmount();
  });

  it('offers a slower relaunch from the real pace once the slowdown ran out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(cappedPushbackJob)),
    );
    const { container, root } = await renderPage();

    await waitForText(container, 'ralenti automatiquement à 60 s');
    await waitForText(container, 'Le site bloque encore nos requêtes');
    const relaunch = relaunchLink(container);
    expect(relaunch).not.toBeUndefined();
    expect(relaunch?.getAttribute('href')).toContain('delaySeconds=120');
    expect(relaunch?.getAttribute('href')).toContain('scanConcurrency=1');

    root.unmount();
  });
});
