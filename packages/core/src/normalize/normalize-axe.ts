/**
 * axe-core candidate extraction.
 *
 * packages/core cannot depend on axe-core for types (see normalize.ts's
 * header comment on why): this file declares its own narrow structural
 * subset of axe's real AxeResults shape, containing only the fields
 * actually read. TypeScript's structural typing means the scanner's real,
 * SDK-typed AxeResults is assignable here with no adapter code.
 */

import { MAX_SNIPPET_LENGTH } from '../types/findings.js';
import { severityFromAxe } from './severity.js';
import { wcagCriteriaFromAxeTags } from './wcag-tags.js';
import type { FindingCandidate } from './candidate.js';

/** axe's real target type allows shadow-DOM-piercing nested arrays
 *  (CrossTreeSelector = string | string[]). Flattened into one selector
 *  string here, joined with axe's own " >>> " shadow-boundary convention.
 *  This is a documented simplification: the full, unflattened target
 *  array is preserved in rawEvidenceForPage for exactness. */
export type AxeTargetInput = Array<string | string[]>;

export interface AxeNodeInput {
  html: string;
  target: AxeTargetInput;
  failureSummary?: string;
  impact?: string | null;
}

export interface AxeViolationInput {
  id: string;
  impact?: string | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl?: string;
  nodes: AxeNodeInput[];
}

export interface AxeResultsInput {
  violations: AxeViolationInput[];
}

function flattenAxeTarget(target: AxeTargetInput): string {
  return target.map((entry) => (Array.isArray(entry) ? entry.join(' ') : entry)).join(' >>> ');
}

function truncateSnippet(html: string): string {
  return html.length > MAX_SNIPPET_LENGTH ? html.slice(0, MAX_SNIPPET_LENGTH) : html;
}

/** 2026-08-25 Lagnonu review, D4b, widened the same day after measurement.
 *
 *  Rules whose defect belongs to the template that emitted an element rather
 *  than to each element individually. A real report listed `link-name`
 *  seventy three times: forty nine were one photo gallery, twenty one were
 *  the one navigation menu repeated in three languages. A second site
 *  (haaitza.com) independently produced eighty one of the same rule with the
 *  same two shapes. The client has one thing to do per template and reads it
 *  seventy three times, which is the duplication trade-off 30 already calls a
 *  bug rather than a long annex.
 *
 *  The identity is the element's authored *shape*: tag name, class list, and
 *  the sorted set of its attribute NAMES, never their values. That is
 *  deliberately not selector normalization, which trade-offs 3 and 30 both
 *  rejected with real counter-examples: nothing here rewrites a selector or
 *  strips a pattern out of one, and two elements merge only when the markup
 *  the site's own author wrote is the same markup. Attribute values are what
 *  vary per instance (`href="/en/press"`, `data-fancybox="gallery-15"`), and
 *  they are exactly what is excluded.
 *
 *  `style` is dropped from the name set because inline styles are commonly
 *  written by script at runtime, so its presence splits one component into
 *  two by accident - measured: `scrollable-region-focusable` collapsed 19 to
 *  2 with it and 19 to 1 without.
 *
 *  A shape with no non-empty class and no attribute outside UNIVERSAL_ATTRS
 *  is not distinctive enough to merge on - a bare `<span class="">` says
 *  nothing about which component it belongs to. Those keep their own
 *  identity, the same "never merge on absent data" rule
 *  normalize-lighthouse.ts's resourceIdentityForItem follows.
 *
 *  Deliberately an allowlist, per trade-off 30's own warning that collapsing
 *  independent problems hides findings. Each entry is a rule where one
 *  template change fixes every occurrence:
 *   - link-name: the accessible name comes from the template writing the link.
 *   - scrollable-region-focusable: one tabindex on one component.
 *   - target-size: one control group, one size rule.
 *
 *  Measured and NOT included: `color-contrast` (12 to 10 on the review site -
 *  the colour pair and the measured ratio differ per element, so a single row
 *  would state one ratio and imply it for the rest) and `image-alt` (writing
 *  alt text is a separate editorial decision per image, not one action over a
 *  set of files). Add a rule here only after measuring it against real
 *  scanner output, never on the assumption that it looks similar. */
const SHAPE_IDENTIFIED_AXE_RULES: ReadonlySet<string> = new Set([
  'link-name',
  'scrollable-region-focusable',
  'target-size',
]);

/** Attributes that carry no signal about which component an element belongs
 *  to, so their presence alone never makes a shape distinctive. */
const UNIVERSAL_ATTRS: ReadonlySet<string> = new Set([
  'href',
  'src',
  'class',
  'id',
  'style',
  'alt',
  'title',
  'value',
  'name',
  'type',
]);

const ROOT_ELEMENT =
  /^\s*<([a-zA-Z][\w-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)/;
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')|([^\s=]+)/g;

export function shapeIdentity(snippet: string): string | undefined {
  const root = ROOT_ELEMENT.exec(snippet);
  if (root === null) return undefined;
  const tag = root[1]!.toLowerCase();

  const names = new Set<string>();
  let classList = '';
  for (const attr of (root[2] ?? '').matchAll(ATTRIBUTE)) {
    const name = (attr[1] ?? attr[4] ?? '').toLowerCase();
    if (name === '') continue;
    if (name === 'class')
      classList = (attr[2] ?? attr[3] ?? '').split(/\s+/).filter(Boolean).join(' ');
    if (name === 'style') continue;
    names.add(name);
  }

  const distinctive = classList !== '' || [...names].some((name) => !UNIVERSAL_ATTRS.has(name));
  if (!distinctive) return undefined;

  return `${tag}.${classList}[${[...names].sort().join(',')}]`;
}

/** Retained from the first, narrower version of D4b: where an element's own
 *  markup is not distinctive, two controls can still state the same parent in
 *  their selectors, and that is a claim the site made rather than one we
 *  inferred. Used only as a fallback, since the shape above is the better
 *  identity wherever it exists. */
const CONTAINER_IDENTIFIED_AXE_RULES: ReadonlySet<string> = new Set(['target-size']);

function containerIdentity(ruleId: string, selector: string): string | undefined {
  if (!CONTAINER_IDENTIFIED_AXE_RULES.has(ruleId)) return undefined;
  const lastCombinator = selector.lastIndexOf('>');
  if (lastCombinator === -1) return undefined;
  const container = selector.slice(0, lastCombinator).trim();
  return container.length > 0 ? container : undefined;
}

function templateIdentity(ruleId: string, selector: string, snippet: string): string | undefined {
  if (SHAPE_IDENTIFIED_AXE_RULES.has(ruleId)) {
    const shape = shapeIdentity(snippet);
    if (shape !== undefined) return shape;
  }
  return containerIdentity(ruleId, selector);
}

/** 2026-08-25. The file an occurrence is about, where the captured element
 *  genuinely IS a file reference.
 *
 *  A real report told a developer to fix `img:nth-of-type(32)`. That names a
 *  position in a DOM, not something anyone can open; the filename is the
 *  actionable half, and axe already hands it to us inside the node HTML it
 *  captures. This reads it back out rather than adding a second scanner pass.
 *
 *  Deliberately root-element-only. A gallery `link-name` failure whose anchor
 *  wraps an image would be more identifiable if we named that image, and it
 *  would also be wrong: the file to change is the template that writes the
 *  link, not the picture inside it, and the annex labels this list "affected
 *  files". Naming the wrong file is worse than naming none, which is the same
 *  reasoning trade-off 30 used to refuse selector normalization.
 *
 *  data: URIs are skipped (the payload is the image, so there is no file to
 *  open) and so is anything absurdly long, which in practice is a data URI
 *  that slipped past the prefix test. */
const SRC_BEARING_ROOT_ELEMENT = /^\s*<(img|source)\b/i;
const SRC_ATTRIBUTE = /\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i;
const MAX_RESOURCE_URL_LENGTH = 300;

export function resourceUrlFromSnippet(html: string, pageUrl: string): string | undefined {
  if (!SRC_BEARING_ROOT_ELEMENT.test(html)) return undefined;
  const match = SRC_ATTRIBUTE.exec(html);
  const raw = (match?.[2] ?? match?.[3] ?? '').trim();
  if (raw === '' || raw.length > MAX_RESOURCE_URL_LENGTH) return undefined;
  if (/^data:/i.test(raw)) return undefined;
  try {
    const resolved = new URL(raw, pageUrl).toString();
    return resolved.length > MAX_RESOURCE_URL_LENGTH ? undefined : resolved;
  } catch {
    return undefined;
  }
}

export function extractAxeCandidates(axe: AxeResultsInput, pageUrl: string): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const violation of axe.violations) {
    const wcagCriteria = wcagCriteriaFromAxeTags(violation.tags);

    for (const node of violation.nodes) {
      const selector = flattenAxeTarget(node.target);
      candidates.push({
        source: 'axe',
        ruleId: violation.id,
        category: 'accessibility',
        severity: severityFromAxe(node.impact ?? violation.impact),
        wcagCriteria,
        title: violation.help,
        description: violation.description,
        ...(violation.helpUrl !== undefined ? { helpUrl: violation.helpUrl } : {}),
        pageUrl,
        element: {
          pageUrl,
          selector,
          snippet: truncateSnippet(node.html),
          ...(() => {
            const resourceUrl = resourceUrlFromSnippet(node.html, pageUrl);
            return resourceUrl === undefined ? {} : { resourceUrl };
          })(),
        },
        ...(() => {
          const identity = templateIdentity(violation.id, selector, node.html);
          return identity === undefined ? {} : { dedupeIdentity: identity };
        })(),
        rawEvidenceForPage: {
          impact: node.impact ?? violation.impact ?? null,
          target: node.target,
          failureSummary: node.failureSummary ?? null,
          tags: violation.tags,
        },
      });
    }
  }

  return candidates;
}
