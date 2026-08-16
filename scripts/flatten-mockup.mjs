#!/usr/bin/env node
/**
 * Extracts the original source document from a mockup bundle.
 *
 * The mockup files embed their own source: one <script> holds a JSON-encoded
 * string containing the complete original HTML (Nocturne design-system CSS +
 * page markup), and another holds a gzip+base64 asset map keyed by UUID
 * (JS modules and Inter woff2 files). Nothing needs to be rendered: this
 * decodes both, rewrites every UUID reference to an inline data URI or inline
 * script, and writes one self-contained file.
 *
 * Usage:
 *   node scripts/flatten-mockup.mjs <input.html> <output.html>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/flatten-mockup.mjs <input.html> <output.html>');
  process.exit(1);
}

const html = readFileSync(resolve(inputArg), 'utf8');

// Pull out every inline <script> body.
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1].trim());

// The asset map: { uuid: { mime, compressed, data(base64) } }
const assetScript = scripts.find((s) => s.startsWith('{') && s.includes('"mime"'));
if (!assetScript) throw new Error('Could not find the asset map script in the bundle.');
const assetMap = JSON.parse(assetScript);

// The source document: a JSON-encoded string starting with a doctype.
const sourceScript = scripts.find((s) => s.startsWith('"') && s.includes('<!DOCTYPE html>'));
if (!sourceScript) throw new Error('Could not find the source document script in the bundle.');
let source = JSON.parse(sourceScript);

// Decode every asset once.
const assets = new Map();
for (const [uuid, entry] of Object.entries(assetMap)) {
  let buf = Buffer.from(entry.data, 'base64');
  if (entry.compressed) buf = gunzipSync(buf);
  assets.set(uuid, { mime: entry.mime, buf });
}

// Fonts and other binary assets become data URIs.
let fontCount = 0;
for (const [uuid, { mime, buf }] of assets) {
  if (!mime.startsWith('font/') && !mime.startsWith('image/')) continue;
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  if (source.includes(uuid)) fontCount += 1;
  source = source.split(uuid).join(dataUri);
}

// Script references (<script src="uuid">) become inline scripts, so the file
// works with no network and no sibling files.
let scriptCount = 0;
for (const [uuid, { mime, buf }] of assets) {
  if (!mime.includes('javascript')) continue;
  const tagPattern = new RegExp(`<script[^>]*src=["']${uuid}["'][^>]*>\\s*</script>`, 'g');
  if (tagPattern.test(source)) {
    scriptCount += 1;
    tagPattern.lastIndex = 0;
    source = source.replace(tagPattern, () => `<script>\n${buf.toString('utf8')}\n</script>`);
  }
}

// The bundle escapes closing tags as \u002F to survive being embedded in a
// <script>. Restore them now that we are writing a real document.
source = source.split('<\\u002Fscript>').join('<\/script>');

writeFileSync(resolve(outputArg), source, 'utf8');

console.log(`Wrote ${resolve(outputArg)}`);
console.log(`  ${(source.length / 1024).toFixed(0)} KB`);
console.log(`  ${fontCount} binary assets inlined, ${scriptCount} scripts inlined`);
