/**
 * Milestone 8 (extended accessibility pass): violation judgment for the
 * alt-text quality heuristic. Same scanner-extracts/core-decides split
 * as every other custom check, with one deliberate difference from the
 * rest of this table: this is explicitly a heuristic red-flag check,
 * not a definitive detection, per docs/rules/manual-accessibility-checklist.md.
 * Judging whether alt text is genuinely *meaningful* is an
 * editorial call this codebase's governing rule does not let a scanner
 * or the LLM make - so this only catches the specific, checkable
 * patterns the checklist names, and the report methodology section must
 * say plainly that clearing this heuristic is not the same as a human
 * review (see docs/archive/report-v2-refactor.md's precedent for how that kind
 * of caveat gets worded).
 *
 * Never flags a missing alt attribute (axe's image-alt rule already
 * does) - only alt text that is present but low-signal.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const ALT_TEXT_QUALITY_HEURISTIC_RULE_ID = 'alt-text-quality-heuristic';
export const ALT_TEXT_QUALITY_HEURISTIC_TITLE = 'Alt text may be low-value';

export interface ImageCheckInput {
  selector: string;
  alt: string | null;
  src: string;
  isMarkedDecorative: boolean;
  width: number;
  height: number;
}

export interface AltTextCheckInput {
  pageUrl: string;
  images: ImageCheckInput[];
}

/** e.g. IMG_4021.jpg, DSC00123.png, PXL_20240102_030405.jpg. */
const FILENAME_PATTERN_ALT =
  /^(img|dsc|dcim|pxl|photo|image|picture)[-_ ]?\d{3,}(\.(jpe?g|png|gif|webp|bmp|heic))?$/i;
const HAS_FILE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|heic)$/i;

const GENERIC_PLACEHOLDER_ALT_TEXT = new Set([
  'image',
  'photo',
  'picture',
  'img',
  'graphic',
  'icon',
]);

/** Below this, a 0-width/height decorative-looking image is very
 *  commonly a spacer or icon even without explicit decorative markup -
 *  conservative on purpose, so this does not flag small UI chrome. */
const MIN_DECORATIVE_CHECK_DIMENSION = 50;

function candidate(
  pageUrl: string,
  image: ImageCheckInput,
  reason: string,
  description: string,
): FindingCandidate {
  return {
    source: 'custom',
    ruleId: ALT_TEXT_QUALITY_HEURISTIC_RULE_ID,
    category: 'accessibility',
    severity: severityFromCustom(ALT_TEXT_QUALITY_HEURISTIC_RULE_ID),
    wcagCriteria: ['1.1.1'],
    // This rule groups several observable signals. The title stays broad so
    // FR and EN reports never present one signal as the meaning of the rule;
    // the reason and evidence below retain the specific observation.
    title: ALT_TEXT_QUALITY_HEURISTIC_TITLE,
    description,
    pageUrl,
    element: {
      pageUrl,
      selector: image.selector,
      snippet: image.alt ?? '',
      // The image file itself, so a per-occurrence row names something a
      // developer can open. Absent rather than empty when the scanner had
      // no usable src (a data: URI, or an <img> with none at all).
      ...(image.src === '' ? {} : { resourceUrl: image.src }),
    },
    // 2026-08-25 Lagnonu review, D4a. This heuristic produced 95 findings
    // and 12 of a 51-page report, one row per image, for a check the report
    // itself presents as a signal to verify rather than a conformity
    // failure. A defect about an image belongs to the image file, not to
    // where it happens to sit in a page: the selector identity split the
    // same logo across 55 pages, and half of these images sit under a
    // slider whose wrapper id is generated at runtime, so those rows also
    // keyed differently on every scan (trade-off 30's unstable-id problem,
    // which additionally breaks cross-run identity for the monitoring tier).
    //
    // Keyed on the reason rather than collapsed rule-wide, because the
    // reasons are different instructions: "write alt text for this image"
    // and "these images share one alt text" are not one action over a set of
    // files, and trade-off 30 is explicit that collapsing independent
    // problems hides findings. Two findings on the review site, not one and
    // not ninety five.
    dedupeIdentity: reason,
    // The image file, carried the same way Lighthouse resource findings
    // carry theirs, so the annex names the files instead of printing a
    // positional selector no developer can act on.
    rawEvidenceForPage: { reason, alt: image.alt, src: image.src, resourceUrl: image.src },
  };
}

export function extractAltTextCandidates(input: AltTextCheckInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const { pageUrl } = input;

  const altGroups = new Map<string, ImageCheckInput[]>();

  for (const image of input.images) {
    if (image.alt === null) continue; // missing entirely - axe's territory, not this heuristic's

    const trimmedAlt = image.alt.trim();

    if (trimmedAlt === '') {
      if (
        !image.isMarkedDecorative &&
        image.width >= MIN_DECORATIVE_CHECK_DIMENSION &&
        image.height >= MIN_DECORATIVE_CHECK_DIMENSION
      ) {
        candidates.push(
          candidate(
            pageUrl,
            image,
            'empty-alt-non-decorative',
            `This image (${Math.round(image.width)}x${Math.round(image.height)}px) has alt="" but is not marked role="presentation"/"none" or aria-hidden="true". Empty alt text is only correct for genuinely decorative images - if this one carries real content, it is currently invisible to screen readers.`,
          ),
        );
      }
      continue;
    }

    if (GENERIC_PLACEHOLDER_ALT_TEXT.has(trimmedAlt.toLowerCase())) {
      candidates.push(
        candidate(
          pageUrl,
          image,
          'generic-placeholder',
          `The alt text "${trimmedAlt}" describes the image as a category, not what it actually shows. This is present but not meaningful to a screen reader user.`,
        ),
      );
      continue;
    }

    if (FILENAME_PATTERN_ALT.test(trimmedAlt) || HAS_FILE_EXTENSION.test(trimmedAlt)) {
      candidates.push(
        candidate(
          pageUrl,
          image,
          'filename-pattern',
          `The alt text "${trimmedAlt}" looks like an unedited camera or file name rather than a description of the image.`,
        ),
      );
      continue;
    }

    const key = trimmedAlt.toLowerCase();
    const group = altGroups.get(key) ?? [];
    group.push(image);
    altGroups.set(key, group);
  }

  for (const group of altGroups.values()) {
    const distinctSrcs = new Set(group.map((image) => image.src));
    if (group.length < 2 || distinctSrcs.size < 2) continue;
    for (const image of group) {
      candidates.push(
        candidate(
          pageUrl,
          image,
          'duplicate-alt-across-different-images',
          `${group.length} images on this page share the exact alt text "${image.alt!.trim()}" but have different sources. If they show different content, sharing identical alt text does not describe any of them individually.`,
        ),
      );
    }
  }

  return candidates;
}
