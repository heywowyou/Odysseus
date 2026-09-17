import type { EvidenceBoundContent, ReportFactRegistry, ReportLanguage } from '@odysseus/core';

export class EvidenceBoundContentError extends Error {}

export function sanitizeModelText(text: string): string {
  return text.replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}
export function assertNoFreehandExactScalar(text: string): void {
  if (/\b(?:https?:\/\/|www\.)\S+|\b\d+(?:[.,]\d+)?(?:\s*%|\s*ms|\s*s|\s*€)?\b/u.test(text)) {
    throw new EvidenceBoundContentError('Exact scalar/URL must be emitted through a fact/reference binding');
  }
}
export function validateEvidenceBoundContent(content: EvidenceBoundContent, registry: ReportFactRegistry): void {
  const facts = new Set(registry.facts.map((fact) => fact.factId));
  for (const segment of content.segments) {
    if (segment.kind === 'text') assertNoFreehandExactScalar(segment.text);
    if (segment.kind === 'fact' && !facts.has(segment.factId)) throw new EvidenceBoundContentError(`Unknown fact binding: ${segment.factId}`);
  }
}
export function resolveEvidenceBoundContent(content: EvidenceBoundContent, registry: ReportFactRegistry, language: ReportLanguage): string {
  validateEvidenceBoundContent(content, registry);
  const facts = new Map(registry.facts.map((fact) => [fact.factId, fact] as const));
  return content.segments.map((segment) => {
    if (segment.kind === 'text') return sanitizeModelText(segment.text);
    if (segment.kind === 'fact') return facts.get(segment.factId)!.display[language];
    return segment.referenceId;
  }).join('');
}
