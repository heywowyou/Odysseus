// Issue #528: html-validate declares vitest, @vitest/expect and jest as
// optional peers for its test-matcher integration, which nothing in this
// repository uses. Because vitest is in the workspace, pnpm linked it into
// html-validate's production snapshot, so the runtime image carried vitest,
// vite, esbuild and jsdom. Dropping the optional peers keeps the scanner's
// production dependency tree free of test tooling.
const TEST_MATCHER_PEERS = ['vitest', '@vitest/expect', 'jest', '@jest/globals', 'jest-snapshot'];

function readPackage(pkg) {
  if (pkg.name === 'html-validate') {
    for (const peer of TEST_MATCHER_PEERS) {
      if (pkg.peerDependencies) delete pkg.peerDependencies[peer];
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta[peer];
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
