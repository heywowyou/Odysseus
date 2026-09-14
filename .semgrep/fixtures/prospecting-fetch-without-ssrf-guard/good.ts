import { checkFetchTarget } from './fetch-address-guard.js';

// ok: prospecting-fetch-without-ssrf-guard
export async function fetchProspectPageSafely(candidateUrl: string): Promise<string | null> {
  const verdict = await checkFetchTarget(candidateUrl);
  if (verdict.kind === 'refused') return null;
  const response = await fetch(candidateUrl, { redirect: 'manual' });
  return response.text();
}
