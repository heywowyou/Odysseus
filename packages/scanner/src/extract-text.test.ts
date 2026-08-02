import { describe, expect, it } from 'vitest';
import { computeMissingPercent, extractTextFromHtml } from './extract-text.js';

describe('extractTextFromHtml', () => {
  it('returns empty string for the spa-demo raw markup', () => {
    const html = '<div id="root"></div>\n<script type="module" src="/src/main.tsx"></script>';
    expect(extractTextFromHtml(html)).toBe('');
  });

  it('strips scripts and styles including their content', () => {
    const html = '<style>.a{color:red}</style><script>doStuff();</script><p>Hello</p>';
    expect(extractTextFromHtml(html)).toBe('Hello');
  });

  it('strips comments and tags, collapses whitespace', () => {
    const html = '<!-- note --><div>  Hello   <span>world</span>  </div>';
    expect(extractTextFromHtml(html)).toBe('Hello world');
  });

  it('decodes common entities', () => {
    const html = '<p>Fish &amp; chips &mdash;? &lt;tag&gt; &quot;quoted&quot; &nbsp; end</p>';
    expect(extractTextFromHtml(html)).toBe('Fish & chips &mdash;? <tag> "quoted" end');
  });
});

describe('computeMissingPercent', () => {
  it('reports 100 when raw has no text at all', () => {
    expect(computeMissingPercent(0, 100)).toBe(100);
  });

  it('reports 0 when raw matches rendered', () => {
    expect(computeMissingPercent(100, 100)).toBe(0);
  });

  it('reports the proportional gap', () => {
    expect(computeMissingPercent(50, 100)).toBe(50);
  });

  it('guards against a zero rendered length', () => {
    expect(computeMissingPercent(100, 0)).toBe(0);
    expect(computeMissingPercent(0, 0)).toBe(0);
  });

  it('clamps when raw exceeds rendered', () => {
    expect(computeMissingPercent(120, 100)).toBe(0);
  });

  it('rounds to two decimal places', () => {
    expect(computeMissingPercent(1, 3)).toBe(66.67);
  });
});
