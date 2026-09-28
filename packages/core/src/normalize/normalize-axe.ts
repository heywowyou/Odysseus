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
import { classifyDocumentWall, extractHostSignalMarkers } from '../acquisition/host-signal.js';
import { SITE_WIDE_IDENTITY, type FindingCandidate } from './candidate.js';

/** axe's real target type allows shadow-DOM-piercing nested arrays
 *  (CrossTreeSelector = string | string[]). Flattened into one selector
 *  string here, joined with axe's own " >>> " shadow-boundary convention.
 *  This is a documented simplification: the full, unflattened target
 *  array is preserved in rawEvidenceForPage for exactness. */
export type AxeTargetInput = Array<string | string[]>;

/** One of axe's check outcomes (`any`, `all`, or `none`). The identity data
 * for rules such as color-contrast lives here, not on the violation node
 * itself: a real axe 4.12 result stores it under `node.any[].data`. */
export interface AxeCheckInput {
  data?: unknown;
}

export interface AxeNodeInput {
  html: string;
  target: AxeTargetInput;
  failureSummary?: string;
  impact?: string | null;
  any?: AxeCheckInput[];
  all?: AxeCheckInput[];
  none?: AxeCheckInput[];
  /** axe's check-specific measurement payload (for example, contrast
   * colours). Kept as unknown because axe uses several shapes. */
  data?: unknown;
}

export interface AxeViolationInput {
  id: string;
  impact?: string | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl?: string;
  nodes: AxeNodeInput[];
  data?: unknown;
}

export interface AxeResultsInput {
  violations: AxeViolationInput[];
}

export interface AxeExtractionOptions {
  challengeFrameSelectors?: readonly string[];
  challengeFrameOrigins?: readonly string[];
  /** The scanner's frame record: each frame element's selector and origin. */
  frameOriginsBySelector?: ReadonlyMap<string, string>;
}

function flattenAxeTarget(target: AxeTargetInput): string {
  return target.map((entry) => (Array.isArray(entry) ? entry.join(' ') : entry)).join(' >>> ');
}

function truncateSnippet(html: string): string {
  return html.length > MAX_SNIPPET_LENGTH ? html.slice(0, MAX_SNIPPET_LENGTH) : html;
}

/** The element's authored *shape*: tag name, class list, and the sorted set
 *  of its attribute NAMES, never their values (2026-08-25 Lagnonu review,
 *  D4b). It is not selector normalization, which trade-offs 3 and 30 both
 *  rejected: two elements share a shape only when the markup the site's own
 *  author wrote is the same markup. Attribute values are what vary per
 *  instance (`href="/en/press"`, `data-fancybox="gallery-15"`), and they are
 *  exactly what is excluded.
 *
 *  axe rules no longer group by shape (plan 075 J1: every axe rule outside
 *  the per-defect list below is one site-wide finding). The shape is still
 *  the component identity of Lighthouse element audits, reflow, heading and
 *  link rules, and names a site-wide finding's distinct examples.
 *
 *  `style` is dropped from the name set because inline styles are commonly
 *  written by script at runtime, so its presence splits one component into
 *  two by accident.
 *
 *  A shape with no non-empty class and no attribute outside UNIVERSAL_ATTRS
 *  is not distinctive enough to merge on - a bare `<span class="">` says
 *  nothing about which component it belongs to. Those keep their own
 *  identity, the same "never merge on absent data" rule
 *  normalize-lighthouse.ts's resourceIdentityForItem follows. */
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

/** Classes that animation and video-player libraries switch on and off as
 *  the page scrolls or resizes. axe copies whichever set was live at audit
 *  time into its selector, so the same footer logo was one finding as
 *  `.responsive-image` and another as `.fadeIn.responsive-image.slower`, and
 *  one YouTube player split by `ytp-small-mode` against
 *  `ytp-large-width-mode`. jQuery UI marks the open tab and the hovered or
 *  focused one with `ui-state-*` and `ui-tabs-active` (one tab strip on Grand
 *  Hôtel Opéra, plan 075 J1). Measured on stored audits; add a class only
 *  when a real site shows it toggling. */
const RUNTIME_STATE_CLASS =
  /^(?:animated|animatedParent|animateOnce|go|slow|slower|slowest|fast|faster|in-view|aos-animate|w--current|ui-tabs-active|ui-state-(?:active|focus|hover))$|^fade(?:In|Out)\w*$|^animate__\w+$|^ytp-[\w-]*-mode$/;

function isRuntimeStateClass(className: string): boolean {
  return RUNTIME_STATE_CLASS.test(className);
}

/** Attributes that state where the visitor is, not what the element is:
 *  Webflow marks the logo link `aria-current="page"` on the home page only,
 *  which split one unnamed logo link into three findings on Bellevigne. */
const RUNTIME_STATE_ATTRS: ReadonlySet<string> = new Set(['aria-current']);

const RUNTIME_STATE_ATTRIBUTE_SELECTOR = /\[aria-current(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\]]*))?\]/g;

/** Id values a script generates on every page load, each shape confirmed on
 *  a real site:
 *   - Swiper names each slider wrapper `swiper-wrapper-<random hex>`: one
 *     Webflow slider list was six critical findings on Bellevigne, one per
 *     page (trade-off 30 records the same token defeating file identity);
 *   - an SVG-inlining script gives every inlined logo a random
 *     `aria-labelledby="_r7krylvsd"` (Le 37 bis, plan 075 J1: 33 findings);
 *   - a form builder writes a random number into a field id,
 *     `#email-487784791` (Hotel Europe, J1).
 *  A plain word or slug id (`#swiper-wrapper-home`, `#popmake-12288`) is
 *  never matched. */
const GENERATED_ID_VALUE =
  /^(?:swiper-wrapper-[0-9a-f]{8,}|_(?=[a-z0-9]*\d)[a-z0-9]{8,}|[a-z][\w-]*?[-_]\d{6,})$/;

const ID_SELECTOR = /#((?:\\.|[\w-])+)/g;

const ID_REFERENCE_ATTRIBUTE_SELECTOR =
  /\[(id|aria-labelledby|aria-describedby)\s*=\s*(?:"([^"]*)"|'([^']*)')\]/g;

function withoutGeneratedIds(selector: string): string {
  return selector
    .replace(ID_SELECTOR, (match, id: string) =>
      GENERATED_ID_VALUE.test(id) ? '#<generated>' : match,
    )
    .replace(
      ID_REFERENCE_ATTRIBUTE_SELECTOR,
      (match, name: string, doubleQuoted?: string, singleQuoted?: string) =>
        GENERATED_ID_VALUE.test(doubleQuoted ?? singleQuoted ?? '') ? `[${name}]` : match,
    );
}

/** One compound selector with its classes in a fixed order. Scripts add
 *  classes in whatever order they run, and axe prints them as found: one
 *  slider button was `.isSlide.fullGallery` on some pages and
 *  `.fullGallery.isSlide` on others, three critical findings on Grand Hôtel
 *  Opéra. Bracketed and parenthesised parts are kept whole. */
function withSortedClasses(compound: string): string {
  const kept: string[] = [];
  const masked = compound.replace(/\[[^\]]*\]|\([^)]*\)/g, (part) => {
    kept.push(part);
    return `\u0000${kept.length - 1}\u0000`;
  });
  const classes = masked.match(/\.-?[_a-zA-Z][\w-]*/g) ?? [];
  const rest = masked.replace(/\.-?[_a-zA-Z][\w-]*/g, '');
  const restored = rest.replace(/\u0000(\d+)\u0000/g, (_, index: string) => kept[Number(index)]!);
  return `${restored}${[...classes].sort().join('')}`;
}

function splitCompounds(selector: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | undefined;
  for (const char of selector) {
    if (quote !== undefined) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(char)) {
      if (current !== '') parts.push(current);
      if (char !== ' ') parts.push(char);
      current = '';
      continue;
    }
    current += char;
  }
  if (current !== '') parts.push(current);
  return parts;
}

const ID_REFERENCE_ATTRIBUTE_IN_MARKUP =
  /\s(id|aria-labelledby|aria-describedby)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Element markup with generated id values blanked, so two copies of one
 *  inlined logo read as one element when a site-wide finding picks its
 *  distinct examples. */
export function markupWithoutGeneratedIds(markup: string): string {
  return markup.replace(
    ID_REFERENCE_ATTRIBUTE_IN_MARKUP,
    (match, name: string, doubleQuoted?: string, singleQuoted?: string) =>
      GENERATED_ID_VALUE.test(doubleQuoted ?? singleQuoted ?? '') ? ` ${name}=""` : match,
  );
}

/** The selector as an identity: runtime state classes, state attributes and
 *  generated ids removed, and classes sorted within each compound. Used as
 *  the identity only; the printed selector is untouched. */
export function withoutRuntimeStateClasses(selector: string): string {
  const stateFree = withoutGeneratedIds(selector)
    .replace(/\.(-?[_a-zA-Z][\w-]*)/g, (match, className: string) =>
      isRuntimeStateClass(className) ? '' : match,
    )
    .replace(RUNTIME_STATE_ATTRIBUTE_SELECTOR, '');
  return splitCompounds(stateFree)
    .map((part) => (/^[>+~]$/.test(part) ? part : withSortedClasses(part)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** axe shortens long attribute values, class lists and attribute lists
 *  with `...`. A shortened token is a fragment of whatever preceded the
 *  cut, not part of the element's markup. */
function isTruncatedToken(token: string): boolean {
  return token.endsWith('...');
}

export function shapeIdentity(snippet: string): string | undefined {
  const root = ROOT_ELEMENT.exec(snippet);
  if (root === null) return undefined;
  const tag = root[1]!.toLowerCase();

  // Snippets are cut at a fixed length. When the cut falls inside the
  // opening tag, its last attribute is a fragment whose length depends on
  // everything before it: a real site gave the same booking button a
  // different SEO aria-label on each page, so the cut landed at
  // `fspanel-ctx-c`, `fspanel-ctx-co`, `fspanel-ctx-cod`, and one button
  // became thirteen findings. A fragment says nothing about the element.
  const rest = snippet.slice(root[0].length).trimStart();
  const truncated = !rest.startsWith('>') && !rest.startsWith('/');
  const attributes = [...(root[2] ?? '').matchAll(ATTRIBUTE)];
  if (truncated) attributes.pop();

  const names = new Set<string>();
  let classList = '';
  for (const attr of attributes) {
    const name = (attr[1] ?? attr[4] ?? '').toLowerCase();
    if (name === '' || /["']/.test(name) || isTruncatedToken(name)) continue;
    if (name === 'class')
      classList = (attr[2] ?? attr[3] ?? '')
        .split(/\s+/)
        .filter(
          (className) =>
            className !== '' && !isRuntimeStateClass(className) && !isTruncatedToken(className),
        )
        .sort()
        .join(' ');
    if (name === 'style' || RUNTIME_STATE_ATTRS.has(name)) continue;
    names.add(name);
  }

  const distinctive = classList !== '' || [...names].some((name) => !UNIVERSAL_ATTRS.has(name));
  if (!distinctive) return undefined;

  return `${tag}.${classList}[${[...names].sort().join(',')}]`;
}

/** 2026-09-19. WordPress core numbers each item it prints in a loop: every
 *  post card gets `post-<ID>` from post_class(), every navigation entry
 *  `menu-item-<ID>`, every listed page `page-item-<ID>`, every listed
 *  category `cat-item-<ID>`. axe then names each card's category link
 *  through its own card, so one theme rule failing on a blog archive
 *  produced 298 findings on a real audit, one per post, each stating the
 *  same colour pair on the same element of the same card template.
 *
 *  The identity reads those four tokens as "an item of this loop". It is
 *  not the selector normalization trade-offs 3 and 30 rejected: the printed
 *  selector is untouched, only core's own numbered-loop tokens are read, and
 *  a generic pattern such as `#popmake-12288` stays distinct. Two elements
 *  merge only when axe's failure statement is also identical, so a card
 *  whose link measures a different colour pair or ratio - the reason
 *  `color-contrast` keeps a per-defect identity - stays its own finding. */
const WORDPRESS_LOOP_ITEM_TOKEN = /([.#])(post|menu-item|page-item|cat-item)-\d+(?![\w-])/g;

export function wordpressLoopIdentity(
  selector: string,
  failureSummary: string | undefined,
): string | undefined {
  WORDPRESS_LOOP_ITEM_TOKEN.lastIndex = 0;
  if (!WORDPRESS_LOOP_ITEM_TOKEN.test(selector)) return undefined;
  const template = selector.replace(WORDPRESS_LOOP_ITEM_TOKEN, '$1$2-*');
  return `${template} | ${(failureSummary ?? '').trim()}`;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' || typeof field === 'number' ? String(field) : undefined;
}

function isVendorCaptchaElement(html: string): boolean {
  const markers = extractHostSignalMarkers(html);
  const hasVendorCaptcha =
    markers.includes('datadome-challenge') || markers.includes('o2switch-challenge');
  if (!hasVendorCaptcha) return false;

  const visibleTextLength = html
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/giu, 'x')
    .replace(/\s+/gu, ' ')
    .trim().length;
  return (
    classifyDocumentWall({
      markupLength: html.length,
      visibleTextLength,
      markers,
    }).classification === 'wall'
  );
}
function isChallengeFrameSelector(
  selector: string,
  options: AxeExtractionOptions | undefined,
): boolean {
  if (!selector.includes('>>>')) return false;
  const framePart = selector.split('>>>', 1)[0]?.trim() ?? '';
  return (
    (options?.challengeFrameSelectors ?? []).some(
      (frameSelector) => framePart === frameSelector || framePart.includes(frameSelector),
    ) ||
    (options?.challengeFrameOrigins ?? []).some(
      (origin) => origin !== '' && selector.includes(origin),
    )
  );
}

/** One embed counts once however axe happened to name its iframe element
 * (`iframe[width="560"]` on one page, `iframe[frameborder="0"]` on the next).
 * The frame's origin is the identity when it is known, from a `src` in the
 * selector or from the scanner's own frame record; otherwise the iframe's
 * attributes are left out, and the inner element's shape carries the
 * identity alone. */
function frameSource(
  selector: string,
  pageUrl: string,
  frameOriginsBySelector: ReadonlyMap<string, string> | undefined,
): string | undefined {
  const boundary = selector.indexOf('>>>');
  if (boundary === -1) return undefined;
  const framePart = selector.slice(0, boundary).trim();
  const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(framePart);
  let source = frameOriginsBySelector?.get(framePart) ?? '*';
  if (srcMatch?.[1] !== undefined) {
    try {
      source = new URL(srcMatch[1], pageUrl).origin;
    } catch {
      source = srcMatch[1];
    }
  }
  return source;
}

function frameIdentity(
  selector: string,
  pageUrl: string,
  snippet: string,
  frameOriginsBySelector: ReadonlyMap<string, string> | undefined,
): string | undefined {
  const source = frameSource(selector, pageUrl, frameOriginsBySelector);
  if (source === undefined) return undefined;
  const innerShape = shapeIdentity(snippet) ?? selector.slice(selector.indexOf('>>>') + 3).trim();
  return `frame:${source}|${innerShape}`;
}

/** Plan 075 Q5 (operator decision, 2026-09-24): a missing text alternative
 *  is one site-wide finding, with every image named in its evidence.
 *  « Write alt text for these images » is one instruction the client's
 *  agency carries out once, the same reading trade-off 30 gave Lighthouse's
 *  resource audits. Whistler Paris named 7 footer images through links whose
 *  aria-label rotated per page, which made 59 critical findings. Q6
 *  (2026-09-28) extended it to `link-name` and `button-name`: Les Criquets
 *  had 64 `link-name` findings for about six components.
 *
 *  Plan 075 J1 (2026-09-28) makes it the default for every axe rule. Each
 *  identity fix before it (runtime state classes, class order, Swiper ids,
 *  truncated snippets, per-rule shapes) closed one site's markup habit, and
 *  the next site brought its own: an SVG-inlining script's random
 *  `aria-labelledby` made 33 `svg-img-alt` findings of one logo on Le 37
 *  bis, a form builder's random field ids split one `label` finding on Hotel
 *  Europe. An axe rule states one instruction (« give these fields a
 *  label »), so the finding is the rule and its occurrences, with the
 *  distinct components as its examples (normalize.ts sampleElements).
 *  Measured on the 21 latest production audits: 445 axe findings to 243,
 *  occurrences unchanged.
 *
 *  Content in a third-party frame keeps one finding per frame origin, so it
 *  stays outside the site's own totals (Q1).
 *
 *  The exceptions are the rules whose identity is a measured value: each
 *  colour pair of `color-contrast` and `link-in-text-block` is its own
 *  design decision with its own ratio (checkDataIdentity below), and one
 *  row would state one ratio and imply it for every other pair. */
const PER_DEFECT_AXE_RULES: ReadonlySet<string> = new Set(['color-contrast', 'link-in-text-block']);

function siteWideIdentity(
  ruleId: string,
  selector: string,
  pageUrl: string,
  frameOriginsBySelector: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (PER_DEFECT_AXE_RULES.has(ruleId)) return undefined;
  const source = frameSource(selector, pageUrl, frameOriginsBySelector);
  return source === undefined ? SITE_WIDE_IDENTITY : `frame:${source}|${SITE_WIDE_IDENTITY}`;
}

/** axe puts the measured colour values in a check outcome's data. Those values are the
 * defect identity: a selector only identifies where one instance happened
 * to render. Missing data deliberately falls through to today's identity. */
function checkDataIdentity(
  ruleId: string,
  nodeData: unknown,
  checkData: unknown,
  violationData: unknown,
): string | undefined {
  const data = nodeData ?? checkData ?? violationData;
  if (ruleId === 'color-contrast') {
    const fg = stringField(data, 'fgColor');
    const bg = stringField(data, 'bgColor');
    const ratio = stringField(data, 'expectedContrastRatio');
    if (fg !== undefined && bg !== undefined && ratio !== undefined) {
      return `color-contrast:${fg}|${bg}|${ratio}`;
    }
  }
  if (ruleId === 'link-in-text-block') {
    const nodeColor = stringField(data, 'nodeColor');
    const parentColor = stringField(data, 'parentColor');
    const ratio = stringField(data, 'requiredContrastRatio');
    if (nodeColor !== undefined && parentColor !== undefined && ratio !== undefined) {
      return `link-in-text-block:${nodeColor}|${parentColor}|${ratio}`;
    }
  }
  return undefined;
}

function axeCheckData(node: AxeNodeInput): unknown {
  for (const checks of [node.any, node.all, node.none]) {
    const data = checks?.find((check) => check.data !== undefined)?.data;
    if (data !== undefined) return data;
  }
  return undefined;
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

/** WCAG 1.4.3 sets no contrast requirement for text in an inactive user
 *  interface component. axe only knows `disabled`; a booking calendar greys
 *  out unavailable dates with its own classes, and one such calendar made a
 *  serious finding of 3,040 occurrences on a real audit. Vendor classes are
 *  added only when confirmed on a real site. */
const INACTIVE_DATE_CELL_CLASS = /\b(?:mphb-not-available-date|mphb-past-date)\b/;

function isInactiveComponent(html: string): boolean {
  const root = ROOT_ELEMENT.exec(html)?.[0] ?? '';
  return (
    /\sdisabled(?:[\s=>]|$)/i.test(root) ||
    /\saria-disabled\s*=\s*["']true["']/i.test(root) ||
    INACTIVE_DATE_CELL_CLASS.test(root)
  );
}

export function extractAxeCandidates(
  axe: AxeResultsInput,
  pageUrl: string,
  options?: AxeExtractionOptions,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const violation of axe.violations) {
    const wcagCriteria = wcagCriteriaFromAxeTags(violation.tags);

    for (const node of violation.nodes) {
      const selector = flattenAxeTarget(node.target);
      if (
        isVendorCaptchaElement(node.html) ||
        isChallengeFrameSelector(selector, options) ||
        (violation.id === 'color-contrast' && isInactiveComponent(node.html))
      ) {
        continue;
      }
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
          const siteWide = siteWideIdentity(
            violation.id,
            selector,
            pageUrl,
            options?.frameOriginsBySelector,
          );
          if (siteWide !== undefined) return { dedupeIdentity: siteWide };
          const identity =
            checkDataIdentity(violation.id, node.data, axeCheckData(node), violation.data) ??
            wordpressLoopIdentity(selector, node.failureSummary);
          const frame = frameIdentity(
            selector,
            pageUrl,
            node.html,
            options?.frameOriginsBySelector,
          );
          const stateFree = withoutRuntimeStateClasses(selector);
          const selectorIdentity =
            identity ?? (stateFree !== selector && stateFree !== '' ? stateFree : undefined);
          const scoped =
            frame === undefined ? selectorIdentity : `${frame}|${identity ?? violation.id}`;
          return scoped === undefined ? {} : { dedupeIdentity: scoped };
        })(),
        // A frame's content never joins the site's own finding for the same
        // rule over the same pages (normalize.ts aggregateSharedScope-
        // Occurrences keys on this): the embed stays one finding per frame
        // origin, outside the site's totals (plan 075 Q1).
        ...(() => {
          const source = frameSource(selector, pageUrl, options?.frameOriginsBySelector);
          return source === undefined ? {} : { coarseGroupIdentity: `frame:${source}` };
        })(),
        rawEvidenceForPage: {
          impact: node.impact ?? violation.impact ?? null,
          target: node.target,
          failureSummary: node.failureSummary ?? null,
          ...(node.data !== undefined ? { data: node.data } : {}),
          tags: violation.tags,
        },
      });
    }
  }

  return candidates;
}
