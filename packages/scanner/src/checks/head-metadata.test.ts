import { describe, expect, it } from 'vitest';
import { parseJsonLdBlocks } from './head-metadata.js';

describe('parseJsonLdBlocks', () => {
  it('parses valid JSON and keeps the raw text and selector', () => {
    const result = parseJsonLdBlocks([{ raw: '{"@type":"WebPage"}', selector: '#ld1' }]);
    expect(result).toEqual([
      { raw: '{"@type":"WebPage"}', selector: '#ld1', parsed: { '@type': 'WebPage' } },
    ]);
  });

  it('captures a parse error instead of throwing for invalid JSON', () => {
    const result = parseJsonLdBlocks([{ raw: '{not valid json', selector: '#ld1' }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.parsed).toBeNull();
    expect(result[0]?.parseError).toBeDefined();
    expect(result[0]?.raw).toBe('{not valid json');
  });

  it('returns an empty array for no blocks', () => {
    expect(parseJsonLdBlocks([])).toEqual([]);
  });

  it('handles a mix of valid and invalid blocks independently', () => {
    const result = parseJsonLdBlocks([
      { raw: '{"a":1}', selector: '#ld1' },
      { raw: 'not json at all', selector: '#ld2' },
    ]);
    expect(result[0]?.parseError).toBeUndefined();
    expect(result[0]?.parsed).toEqual({ a: 1 });
    expect(result[1]?.parseError).toBeDefined();
    expect(result[1]?.parsed).toBeNull();
  });
});
