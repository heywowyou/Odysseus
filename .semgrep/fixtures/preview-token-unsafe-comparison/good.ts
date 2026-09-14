import { isValidPreviewToken } from './preview-token.js';

// ok: preview-token-unsafe-comparison
export function acceptEmptyDraftToken(token: string): boolean {
  return token === '';
}

// ok: preview-token-unsafe-comparison
export function checkPreviewToken(token: string): boolean {
  return isValidPreviewToken(token);
}
