/**
 * The preview's stylesheet, held as a TypeScript string rather than a `.css`
 * file.
 *
 * `render-html.ts`'s `readStylesInlined()` convention is asynchronous, and
 * `generateOutreachPreviewHtml` is specified to be synchronous. A template
 * literal keeps that signature, keeps the document genuinely zero-network (no
 * font fetch, no external sheet), and leaves the locked `nocturne.css`
 * untouched: the values below are *derived* from it, in the same
 * "re-derive, never invent" spirit trade-off 9 sets for the paid report, rather
 * than imported from it.
 *
 * The font stack is system fonts only. The paid report embeds Inter as base64
 * for print fidelity; a cold-outreach page loaded once in a browser does not
 * justify several hundred kilobytes, and a web font would be either a network
 * request or a large inline payload.
 */

export const OUTREACH_PREVIEW_STYLES = `
:root {
  /* Derived from packages/report/src/styles/nocturne.css, not invented. */
  --bg: #161826;
  --surface: #232532;
  --text: #e9e9ed;
  --muted: #b2b6ca;
  --accent: #d2cefd;
  --divider: rgba(233, 233, 237, 0.16);
  --radius: 10px;
  --space: 16px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: calc(var(--space) * 2) var(--space);
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

main { max-width: 720px; margin: 0 auto; }

h1 { font-size: 1.6rem; line-height: 1.3; margin: 0 0 var(--space); }
h2 { font-size: 1.15rem; line-height: 1.35; margin: calc(var(--space) * 2) 0 var(--space); }
h3 { font-size: 1rem; margin: var(--space) 0 calc(var(--space) / 2); }

p { margin: 0 0 var(--space); }

a { color: var(--accent); }
a:focus-visible {
  /* A visible focus style is a WCAG 2.4.7 requirement and the browser default
     is easy to lose against this background. */
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.lede { color: var(--muted); }

section {
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: var(--radius);
  padding: var(--space);
  margin: 0 0 var(--space);
}

.observations { list-style: none; margin: 0; padding: 0; }
.observations li {
  border-top: 1px solid var(--divider);
  padding: calc(var(--space) / 1.5) 0;
}
.observations li:first-child { border-top: 0; }

.meta {
  color: var(--muted);
  font-size: 0.85rem;
  margin: calc(var(--space) / 3) 0 0;
}

figure { margin: 0 0 var(--space); }
figcaption { color: var(--muted); font-size: 0.85rem; margin-top: calc(var(--space) / 3); }

/* Evidence images are wide captures. They scale down rather than forcing the
   page to scroll sideways, which WCAG 1.4.10 requires at 320px. */
img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: calc(var(--radius) / 2);
  border: 1px solid var(--divider);
}

.disclosure { color: var(--muted); font-size: 0.85rem; }

.actions { display: flex; flex-wrap: wrap; gap: var(--space); }
`.trim();
