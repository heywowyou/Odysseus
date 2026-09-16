/**
 * Issue #372: placeholder-only-label. A text field whose only visible name
 * is its placeholder passes axe's `label` rule, because accessible-name
 * computation accepts the placeholder as a last resort (see
 * docs/rules/manual-accessibility-checklist.md). It is still a real defect:
 * the hint disappears as soon as the visitor types, is usually low contrast,
 * and is not reliably announced by every screen reader.
 *
 * The scanner only extracts facts; normalize-placeholder-labels.ts decides.
 * A control counts as labelled when any source other than the placeholder
 * gives it a non-empty name: an associated <label> (wrapping or `for`),
 * aria-labelledby pointing at text, aria-label, or title. Hidden controls
 * and the input types that never take a placeholder are skipped.
 */

import type { Page } from 'playwright';

export interface PlaceholderLabelControl {
  selector: string;
  /** 'textarea', or the input's type attribute (lower-cased, 'text' when absent). */
  controlType: string;
  placeholder: string;
  /** True when a name source other than the placeholder is non-empty. */
  hasOtherName: boolean;
}

export interface PlaceholderLabelsExtraction {
  pageUrl: string;
  controls: PlaceholderLabelControl[];
}

/** Long placeholders are cut in the stored evidence; the annex only needs
 *  enough to recognise the field. */
const PLACEHOLDER_MAX_LENGTH = 80;

export async function checkPlaceholderLabels(
  page: Page,
  pageUrl: string,
): Promise<PlaceholderLabelsExtraction> {
  const controls = await page.evaluate((placeholderMaxLength) => {
    const EXCLUDED_INPUT_TYPES = new Set([
      'hidden',
      'submit',
      'button',
      'reset',
      'image',
      'checkbox',
      'radio',
      'file',
      'range',
      'color',
    ]);

    const structuralPath = (el: Element): string => {
      const parts: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.documentElement) {
        if (current.id) {
          parts.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        const parent: Element | null = current.parentElement;
        if (!parent) break;
        const index = Array.from(parent.children).indexOf(current) + 1;
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
        current = parent;
      }
      return parts.join(' > ');
    };

    const text = (value: string | null | undefined): string => (value ?? '').trim();

    const isRendered = (el: HTMLElement): boolean => {
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const elements = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    );
    return elements.flatMap((el) => {
      const placeholder = text(el.getAttribute('placeholder'));
      if (placeholder.length === 0) return [];
      const controlType =
        el instanceof HTMLTextAreaElement
          ? 'textarea'
          : (el.getAttribute('type') ?? 'text').toLowerCase();
      if (EXCLUDED_INPUT_TYPES.has(controlType)) return [];
      if (!isRendered(el)) return [];

      const labelledByText = text(el.getAttribute('aria-labelledby'))
        .split(/\s+/)
        .filter((id) => id.length > 0)
        .map((id) => text(document.getElementById(id)?.textContent))
        .join('');
      const labelText = Array.from(el.labels ?? [])
        .map((label) => text(label.textContent))
        .join('');
      const hasOtherName =
        labelText.length > 0 ||
        labelledByText.length > 0 ||
        text(el.getAttribute('aria-label')).length > 0 ||
        text(el.getAttribute('title')).length > 0;

      return [
        {
          selector: el.id ? `#${CSS.escape(el.id)}` : structuralPath(el),
          controlType,
          placeholder: placeholder.slice(0, placeholderMaxLength),
          hasOtherName,
        },
      ];
    });
  }, PLACEHOLDER_MAX_LENGTH);

  return { pageUrl, controls };
}
