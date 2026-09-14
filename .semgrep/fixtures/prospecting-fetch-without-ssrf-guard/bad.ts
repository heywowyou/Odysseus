// ruleid: prospecting-fetch-without-ssrf-guard
export async function fetchProspectPageUnsafely(candidateUrl: string): Promise<string> {
  const response = await fetch(candidateUrl, { redirect: 'manual' });
  return response.text();
}
