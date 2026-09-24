/**
 * Reads the schema.org markup a page already carries - JSON-LD, microdata
 * and RDFa - into one plain shape the validation pass can work on.
 *
 * This replaces `structured-data-testing-tool`, whose extraction half was
 * `web-auto-extractor@1.0.17` on `cheerio@0.22.0` (2016) and the lodash
 * micro-package long tail underneath it, all unmaintained. The scanner
 * already owns the judgment half of this check, so owning the reading half
 * too drops that whole dependency chain in one move.
 *
 * The parser is `html-validate`'s, already a scanner dependency for the HTML
 * structural-validity check, and public API (`Parser`, `Config`). Nothing new
 * is installed to read a DOM.
 *
 * Everything here is offline and pure: a string in, plain objects out, no
 * network and no browser. That is what lets the validation pass be unit
 * tested against hand-written HTML rather than against a live page.
 */

import { Config, Parser, type HtmlElement, type ResolvedConfig } from 'html-validate';

export type StructuredDataMarkup = 'jsonld' | 'microdata' | 'rdfa';

/** One schema.org item declared on the page, with the markup form it was
 *  declared in. Nested items appear as object-valued properties of their
 *  parent, never as separate entries, which is what makes an index like
 *  `Article[0]` mean "the first Article on the page". */
export interface SchemaItem {
  markup: StructuredDataMarkup;
  schema: string;
  properties: Record<string, unknown>;
}

/** `https://schema.org/BlogPosting`, `schema:BlogPosting` and a bare
 *  `BlogPosting` are the three ways a page declares the same type. */
function schemaNameOf(rawType: string): string | null {
  const trimmed = rawType.trim();
  if (trimmed === '') return null;
  const lastSegment = trimmed.split(/[/#]/).pop() ?? trimmed;
  const withoutPrefix = lastSegment.includes(':')
    ? (lastSegment.split(':').pop() ?? lastSegment)
    : lastSegment;
  return withoutPrefix === '' ? null : withoutPrefix;
}

function attr(element: HtmlElement, name: string): string | null {
  const value = element.getAttributeValue(name);
  return typeof value === 'string' ? value : null;
}

/** The WHATWG microdata rules for where a property's value lives: an
 *  attribute for elements that carry machine-readable content, text for
 *  everything else. */
const VALUE_ATTRIBUTE_BY_TAG: Record<string, string> = {
  meta: 'content',
  audio: 'src',
  embed: 'src',
  iframe: 'src',
  img: 'src',
  source: 'src',
  track: 'src',
  video: 'src',
  a: 'href',
  area: 'href',
  link: 'href',
  object: 'data',
  data: 'value',
  meter: 'value',
  time: 'datetime',
};

function propertyValue(element: HtmlElement): string {
  const valueAttribute = VALUE_ATTRIBUTE_BY_TAG[element.tagName.toLowerCase()];
  if (valueAttribute !== undefined) {
    const value = attr(element, valueAttribute);
    if (value !== null) return value.trim();
  }
  return element.textContent.trim();
}

/** A property named more than once on one item becomes an array, the way
 *  schema.org's own multi-value properties (several images, several authors)
 *  are read everywhere else. */
function addProperty(properties: Record<string, unknown>, name: string, value: unknown): void {
  const existing = properties[name];
  if (existing === undefined) {
    properties[name] = value;
    return;
  }
  properties[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
}

interface MarkupVocabulary {
  /** Attribute declaring a new item: `itemscope`/`itemtype` or `typeof`. */
  typeAttribute: string;
  /** Attribute naming a property of the enclosing item. */
  propertyAttribute: string;
}

const MICRODATA: MarkupVocabulary = { typeAttribute: 'itemtype', propertyAttribute: 'itemprop' };
const RDFA: MarkupVocabulary = { typeAttribute: 'typeof', propertyAttribute: 'property' };

function isItemRoot(element: HtmlElement, vocabulary: MarkupVocabulary): boolean {
  const rawType = attr(element, vocabulary.typeAttribute);
  return rawType !== null && schemaNameOf(rawType) !== null;
}

/** Walks one item's subtree collecting its own properties. A descendant that
 *  starts an item of its own is either a nested value (it also carries a
 *  property name) or an unrelated sibling item (it does not) - either way the
 *  walk stops there, so a nested item's properties never leak upward into its
 *  parent. */
function collectProperties(
  element: HtmlElement,
  vocabulary: MarkupVocabulary,
  properties: Record<string, unknown>,
  nested: Set<HtmlElement>,
): void {
  for (const child of element.childElements) {
    const propertyName = attr(child, vocabulary.propertyAttribute);
    const startsItem = isItemRoot(child, vocabulary);

    if (startsItem) {
      nested.add(child);
      if (propertyName !== null && propertyName.trim() !== '') {
        addProperty(
          properties,
          propertyName.trim(),
          buildItem(child, vocabulary, nested).properties,
        );
      }
      continue;
    }

    if (propertyName !== null && propertyName.trim() !== '') {
      addProperty(properties, propertyName.trim(), propertyValue(child));
    }

    collectProperties(child, vocabulary, properties, nested);
  }
}

function buildItem(
  element: HtmlElement,
  vocabulary: MarkupVocabulary,
  nested: Set<HtmlElement>,
): { schema: string; properties: Record<string, unknown> } {
  const schema = schemaNameOf(attr(element, vocabulary.typeAttribute) ?? '') ?? '';
  const properties: Record<string, unknown> = { '@type': schema };
  collectProperties(element, vocabulary, properties, nested);
  return { schema, properties };
}

function extractAttributeMarkup(
  root: HtmlElement,
  vocabulary: MarkupVocabulary,
  markup: StructuredDataMarkup,
): SchemaItem[] {
  const roots = root
    .querySelectorAll(`[${vocabulary.typeAttribute}]`)
    .filter((element) => isItemRoot(element, vocabulary));
  const nested = new Set<HtmlElement>();
  const built = new Map<HtmlElement, { schema: string; properties: Record<string, unknown> }>();

  for (const element of roots) {
    if (nested.has(element)) continue;
    built.set(element, buildItem(element, vocabulary, nested));
  }

  // A nested item is a property value of its parent, not an item in its own
  // right, so it must not also be counted as `Schema[n]` at the top level.
  // Nesting can only be discovered while walking a parent, which is why the
  // filter happens after every root has been walked, not during.
  return [...built.entries()]
    .filter(([element]) => !nested.has(element))
    .map(([, item]) => ({ markup, schema: item.schema, properties: item.properties }));
}

function jsonLdObjects(value: unknown, into: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) jsonLdObjects(entry, into);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  // `@graph` is a container, not an item: its members are the items.
  if ('@graph' in record) {
    jsonLdObjects(record['@graph'], into);
    if (!('@type' in record)) return;
  }
  if ('@type' in record) into.push(record);
}

function extractJsonLd(root: HtmlElement): SchemaItem[] {
  const items: SchemaItem[] = [];

  for (const script of root.querySelectorAll('script')) {
    const type = attr(script, 'type');
    if (type === null || type.trim().toLowerCase() !== 'application/ld+json') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      // A block that is not valid JSON declares nothing. It is not this
      // check's business to report the syntax error: html-validity.ts owns
      // malformed-markup reporting, and a second finding for the same defect
      // is exactly the duplication trade-off 3 guards against.
      continue;
    }

    const objects: Record<string, unknown>[] = [];
    jsonLdObjects(parsed, objects);

    for (const object of objects) {
      const rawType = object['@type'];
      // `"@type": ["Article", "BlogPosting"]` declares one item claiming both
      // types, so it is indexed under each.
      const rawTypes = Array.isArray(rawType) ? rawType : [rawType];
      for (const candidate of rawTypes) {
        if (typeof candidate !== 'string') continue;
        const schema = schemaNameOf(candidate);
        if (schema === null) continue;
        items.push({ markup: 'jsonld', schema, properties: object });
      }
    }
  }

  return items;
}

/** html-validate resolves a config asynchronously (it may load plugins), and
 *  the empty config is the same every time, so it is resolved once and kept
 *  rather than rebuilt per page. This is the only reason extraction is async;
 *  nothing here does I/O. */
let cachedConfig: ResolvedConfig | undefined;

async function emptyResolvedConfig(): Promise<ResolvedConfig> {
  cachedConfig ??= await Config.empty().resolve();
  return cachedConfig;
}

/** An empty attribute whose name holds a quote, as `page.content()`
 *  serializes a stray quote in the source (`<i class="x"">` becomes
 *  `<i class="x" "="">`, and an unclosed value that swallows the next tag
 *  leaves names such as `preload"`). Browsers accept it and so does the
 *  page; the html-validate tokenizer throws on it, and one such icon lost
 *  the structured-data check on every page of Grand Hôtel des Alpes and on
 *  106 of 173 pages of Grand Hôtel Opéra. The attribute carries no data,
 *  and a real value cannot match: the browser writes `"` in a value as
 *  `&quot;`. */
const STRAY_QUOTED_ATTRIBUTE = /\s[^\s=>"']*["'][^\s=>]*=""/g;
const OPENING_TAG = /<[a-zA-Z][^<>]*>/g;

export function withoutStrayQuotedAttributes(html: string): string {
  return html.replace(OPENING_TAG, (tag) => tag.replace(STRAY_QUOTED_ATTRIBUTE, ''));
}

export async function extractSchemaItems(html: string): Promise<SchemaItem[]> {
  const parser = new Parser(await emptyResolvedConfig());
  const dom = parser.parseHtml(withoutStrayQuotedAttributes(html));

  return [
    ...extractJsonLd(dom),
    ...extractAttributeMarkup(dom, MICRODATA, 'microdata'),
    ...extractAttributeMarkup(dom, RDFA, 'rdfa'),
  ];
}
