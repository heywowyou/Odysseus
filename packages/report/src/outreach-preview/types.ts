/**
 * The renderer's view of the preview contract.
 *
 * The types and their Zod schema live in `@odysseus/core`
 * (`types/outreach-preview.ts`) because `packages/report` carries no `zod`
 * dependency and because `packages/llm` needs the same contract for plan 010's
 * prose validation. This module re-exports them so a publisher importing from
 * `@odysseus/report` sees one coherent public surface and never has to know
 * which package the decision happens to live in.
 */

export type {
  OutreachPreviewImage,
  OutreachPreviewInput,
  OutreachPreviewLanguage,
  PublicFindingSummary,
} from '@odysseus/core';
