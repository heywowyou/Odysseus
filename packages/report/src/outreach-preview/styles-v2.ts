/**
 * The v2 scorecard preview's stylesheet, same constraints as the v1 one:
 * a TypeScript string (the renderer stays synchronous), zero network, and
 * values derived from locked Nocturne sources rather than invented.
 *
 * Derived from:
 * - `packages/report/src/styles/nocturne.css` (bg/surface/text/divider,
 *   accent scale, radius, spacing rhythm)
 * - `packages/report/src/template/design-tokens.ts` (the severity and
 *   category tile pairs, which are the report-design doc's own source of
 *   truth for badges)
 * - `packages/report/src/styles/paged.css`'s print block (the light print
 *   ground #f7f7f5 and its measured print-safe text colors)
 *
 * The print block is what the operator PDF prints through: the dark screen
 * ground inverts to the report's print ground so a downloaded PDF is not a
 * wall of ink, and the severity tiles swap to the same print-safe pairs the
 * paid report uses for text on that light background.
 */

export const OUTREACH_PREVIEW_STYLES_V2 = `
:root {
  /* nocturne.css tokens */
  --bg: #161826;
  --surface: #232532;
  --text: #e9e9ed;
  --muted: #b2b6ca;
  --faint: #9397ab;
  --accent: #d2cefd;
  --divider: rgba(233, 233, 237, 0.16);
  --radius: 10px;
  --radius-sm: 4px;
  --space-1: 2.8px;
  --space-2: 5.6px;
  --space-3: 8.4px;
  --space-4: 11.2px;
  --space-6: 16.8px;
  --space-8: 22.4px;
  --space-12: 33.6px;
  /* design-tokens.ts severity pairs (dark ground) */
  --sev-critical: #d97b82; --sev-critical-bg: #34232a;
  --sev-serious: #dba36c;  --sev-serious-bg: #362a1c;
  --sev-moderate: #d6c96e; --sev-moderate-bg: #35331c;
  --sev-minor: #b2b6ca;    --sev-minor-bg: #292b31;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: var(--space-12) var(--space-6);
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
}

main { max-width: 720px; margin: 0 auto; }

h1, h2, h3 { font-weight: 500; }

h1 { font-size: 1.7rem; line-height: 1.25; margin: var(--space-2) 0 var(--space-3); }
h2 { font-size: 1.15rem; margin: 0 0 var(--space-4); }
h3 { font-size: 1rem; margin: 0 0 var(--space-2); }

p { margin: 0 0 var(--space-4); }
p:last-child { margin-bottom: 0; }

a { color: var(--accent); }
a:focus-visible {
  /* WCAG 2.4.7: the browser default is easy to lose on this ground. */
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.label {
  color: var(--faint);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 var(--space-2);
}

.lede { color: var(--muted); }

.meta { color: var(--muted); font-size: 0.85rem; }

section {
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: var(--radius);
  padding: var(--space-6);
  margin: 0 0 var(--space-6);
}

/* Stat tiles: the report's 4-up tile rhythm, stacked on small screens. */
.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}
.tiles.four { grid-template-columns: repeat(4, 1fr); }
.tile {
  background: var(--bg);
  border: 1px solid var(--divider);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
}
.tile .value {
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.2;
}
.tile .key { color: var(--muted); font-size: 0.8rem; margin-top: var(--space-1); }

/* Severity tiles: the pair carries the meaning, the label carries the word. */
.tile.severity-critical { background: var(--sev-critical-bg); }
.tile.severity-critical .value { color: var(--sev-critical); }
.tile.severity-serious { background: var(--sev-serious-bg); }
.tile.severity-serious .value { color: var(--sev-serious); }
.tile.severity-moderate { background: var(--sev-moderate-bg); }
.tile.severity-moderate .value { color: var(--sev-moderate); }
.tile.severity-minor { background: var(--sev-minor-bg); }
.tile.severity-minor .value { color: var(--sev-minor); }

.cards { display: flex; flex-direction: column; gap: var(--space-4); }
.card {
  border-top: 1px solid var(--divider);
  padding-top: var(--space-4);
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  color: var(--muted);
  font-size: 0.85rem;
  margin-top: var(--space-2);
}

.fineprint { color: var(--muted); font-size: 0.85rem; }

.actions { display: flex; flex-wrap: wrap; gap: var(--space-4); }

.cta {
  display: inline-block;
  background: var(--accent);
  color: #161826;
  font-weight: 600;
  text-decoration: none;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-6);
}
.cta:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }

/* The operator PDF prints through this block: the dark ground inverts to
   the paid report's print ground, and the severity tiles swap to the same
   print-safe pairs paged.css derives for #f7f7f5, all measured at 4.5:1
   or better. */
@media print {
  :root {
    --bg: #f7f7f5;
    --surface: #ffffff;
    --text: #161826;
    --muted: #595d6c;
    --faint: #595d6c;
    --accent: #423a6a;
    --divider: rgba(22, 24, 38, 0.2);
    --sev-critical: #a52a37; --sev-critical-bg: #ffffff;
    --sev-serious: #8a5a1e;  --sev-serious-bg: #ffffff;
    --sev-moderate: #6e6a1f; --sev-moderate-bg: #ffffff;
    --sev-minor: #595d6c;    --sev-minor-bg: #ffffff;
  }
  body { padding: 0; }
  main { max-width: none; }
  section { border-color: var(--divider); }
  .cta { background: var(--accent); color: #ffffff; }
}

@page { size: A4; margin: 14mm; }
`.trim();
