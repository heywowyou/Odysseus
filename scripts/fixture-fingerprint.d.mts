/** Types for the plain-ESM helper shared by scripts/refresh-fixtures.mjs and
 *  packages/core/src/normalize/fixture-freshness.test.ts. Kept as .mjs plus a
 *  declaration rather than TypeScript because scripts/ is deliberately outside
 *  the tsc -b build graph and must run with bare node. */
export declare const REPO_ROOT: string;
export declare const FINGERPRINT_FILENAME: string;
export declare function normalizeFingerprint(): string;
export declare function fixtureAudits(): Array<{ dir: string; purpose: string }>;
