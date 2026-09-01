import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared fixtures/spa-demo dev server for the scanner e2e suites
// (scan-page, scan-site, crawl, render-diff, artifacts/write-audit).
// Previously each suite spawned its own vite on a hand-allocated port,
// which cost four extra server startups per e2e run and produced a real
// EADDRINUSE when suites collided (see render-diff-settle.e2e.test.ts).
// The e2e project's globalSetup starts one server and provides the origin;
// suites read it with inject('spaDemoOrigin'). Duplicated paths rather than
// imported so this stays plain JS outside the tsc -b project-reference
// graph, same as vitest-global-setup.mjs.

const spaDemoDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/spa-demo',
);
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const poll = async () => {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${url} to respond`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return poll();
  };
  return poll();
}

export default async function setup({ provide }) {
  const port = await findFreePort();
  const devServer = spawn(viteBin, ['--port', String(port), '--strictPort'], {
    cwd: spaDemoDir,
    stdio: 'ignore',
  });

  const origin = `http://localhost:${port}`;
  try {
    await waitForServer(origin, 30_000);
  } catch (error) {
    devServer.kill();
    throw error;
  }

  provide('spaDemoOrigin', origin);

  return async () => {
    devServer.kill();
  };
}
