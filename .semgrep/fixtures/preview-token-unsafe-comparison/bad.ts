// ruleid: preview-token-unsafe-comparison
export function isSamePreviewToken(requestToken: string, storedToken: string): boolean {
  return requestToken === storedToken;
}
