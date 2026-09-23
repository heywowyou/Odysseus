import http, { type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from './browser.js';
import { crawlSite } from './crawl.js';
import { HostRequestScheduler, type HostPushbackEvent } from './host-request-scheduler.js';
import { runRenderedAnalysis } from './scan-page.js';

let siteServer: Server;
let frameServer: Server;
let siteOrigin: string;
let frameOrigin: string;
let browser: Browser;
let screenshotDir: string;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server.');
      resolve(address.port);
    });
  });
}

function close(server: Server | undefined): Promise<void> {
  return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

const substantiveText = 'This is ordinary hotel information. '.repeat(24);

describe('shared host signal classification in scanner flows', () => {
  beforeAll(async () => {
    frameServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        '<html><head><title>Just a moment</title></head><body><p>Challenge frame</p></body></html>',
      );
    });
    const framePort = await listen(frameServer);
    frameOrigin = `http://127.0.0.1:${framePort}`;

    siteServer = http.createServer((request, response) => {
      if (request.url === '/robots.txt') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('User-agent: *\nAllow: /');
        return;
      }
      if (request.url === '/sitemap.xml') {
        response.writeHead(404);
        response.end();
        return;
      }
      if (
        request.url === '/assets/datadome.js' ||
        request.url?.startsWith('/cdn-cgi/challenge-platform/')
      ) {
        response.writeHead(200, { 'Content-Type': 'application/javascript' });
        response.end('window.challengeScriptLoaded = true;');
        return;
      }
      if (request.url === '/tiny-challenge') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<html><body><img src="https://o2swit.ch/assets/tiger.svg"></body></html>');
        return;
      }
      if (request.url === '/single-500') {
        response.writeHead(500, { 'Content-Type': 'text/html' });
        response.end(`<html><body><p>${substantiveText}</p></body></html>`);
        return;
      }
      if (request.url === '/frame-host') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(
          `<html><body><iframe title="media" src="${frameOrigin}/widget"></iframe><p>${substantiveText}</p></body></html>`,
        );
        return;
      }
      const link =
        request.url === '/' || request.url === '/normal' ? '<a href="/next">Next</a>' : '';
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        `<html><body><script src="/assets/datadome.js"></script><script src="/cdn-cgi/challenge-platform/h/scripts.js"></script><p>${substantiveText}</p>${link}</body></html>`,
      );
    });
    const sitePort = await listen(siteServer);
    siteOrigin = `http://127.0.0.1:${sitePort}`;
    ({ browser } = await launchBrowser());
    screenshotDir = await mkdtemp(path.join(tmpdir(), 'odysseus-host-signal-'));
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await close(siteServer);
    await close(frameServer);
    if (screenshotDir !== '') await rm(screenshotDir, { recursive: true, force: true });
  });

  it('keeps normal DataDome and challenge-platform scripts as visited content', async () => {
    const pushback: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 1,
      onPushback: (event) => pushback.push(event),
    });

    const result = await crawlSite(`${siteOrigin}/normal`, {
      browser,
      maxPages: 5,
      maxDepth: 2,
      delayMs: 0,
      scheduler,
    });

    expect(result.pages.find((page) => page.url.endsWith('/normal'))?.status).toBe('visited');
    expect(result.pages.find((page) => page.url.endsWith('/next'))?.status).toBe('visited');
    expect(pushback).toEqual([]);
  }, 30_000);

  it('blocks one tiny o2switch challenge document with one pushback event', async () => {
    const pushback: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 1,
      onPushback: (event) => pushback.push(event),
    });

    const result = await crawlSite(`${siteOrigin}/tiny-challenge`, {
      browser,
      maxPages: 1,
      maxDepth: 0,
      delayMs: 0,
      scheduler,
    });

    expect(result.pages[0]?.status).toBe('blocked');
    expect(pushback).toHaveLength(1);
    expect(pushback[0]?.kind).toBe('bot-challenge');
  }, 30_000);

  it('records a single 500 as a page error without pushback', async () => {
    const pushback: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 1,
      onPushback: (event) => pushback.push(event),
    });

    const result = await crawlSite(`${siteOrigin}/single-500`, {
      browser,
      maxPages: 1,
      maxDepth: 0,
      delayMs: 0,
      scheduler,
    });

    expect(result.pages[0]?.status).toBe('http-error-status');
    expect(pushback).toEqual([]);
  }, 30_000);

  it('records a challenge frame without slowing the audited host', async () => {
    const pushback: HostPushbackEvent[] = [];
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 0,
      maxConcurrency: 1,
      onPushback: (event) => pushback.push(event),
    });

    const result = await runRenderedAnalysis(browser, `${siteOrigin}/frame-host`, {
      screenshotDir,
      scheduler,
      timeoutMs: 10_000,
      checkTimeoutMs: 2_000,
    });

    expect(
      result.frames?.some((frame) => frame.challengeMarkers?.includes('challenge-title')),
    ).toBe(true);
    expect(pushback).toEqual([]);
  }, 30_000);
});
