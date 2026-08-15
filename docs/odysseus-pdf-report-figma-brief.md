# Odysseus audit report, PDF design brief for Figma

## What this is

Design the visual system and page layouts for a client-facing PDF audit report, in Figma. This is a design exploration, not implementation. The actual document is generated later by printing an HTML and Tailwind template through headless Chromium, against real, variable-length content. So the most valuable output of this session is not pixel-perfect pagination, it is a coherent design system: a small set of Figma variables (color, type, spacing) and reusable component patterns (a theme card, a severity badge, a findings table row, a metrics table row) that can be read directly and translated into Tailwind config and markup afterward, including through Figma's MCP connection to Claude Code.

Treat each page frame below as one representative state to review, not a guarantee of where real content will break. A real report can have anywhere from a handful of themes to fifteen, and a findings appendix from under twenty rows to several hundred. Design components that hold up at both ends, rather than a layout tuned to the exact row counts used as examples here.

## Who reads this

Two different readers, at two different depths, in the same document.

A non-technical decision maker (often the business owner) reads the cover and the executive summary and needs to walk away knowing what is wrong, why it costs them money or exposes them legally, and what to do first. No jargon without a plain explanation on first use.

A developer, either the client's own or an agency's, reads the findings appendix and needs exact rule IDs, selectors, WCAG criteria, and affected pages. This section can be dense and technical, that is correct for its reader.

## Business and brand context

The tool is called Odysseus. It audits French SMB websites for two things at once: SEO problems caused by modern JavaScript frameworks that search engines cannot read (the render diff), and accessibility non-compliance under the EU Accessibility Act and WCAG 2.2 AA. Target clients are e-commerce, hospitality, wine estates, real estate, clinics, and professional services, often bilingual, often on sites built by agencies that did not test rendering or accessibility.

There is no existing visual identity. Propose one as part of this work: a color palette, a type scale, and a simple wordmark treatment for "Odysseus" (not a full logo system). Tone should read as credible and technical rather than flashy, closer to a security or compliance audit than a marketing deliverable. This is a document a client may show to their own developer or their lawyer.

One constraint worth building in deliberately: this report audits other sites for accessibility, so its own use of color for severity and status must not rely on color alone. Pair every color-coded indicator (severity, risk level, effort, impact) with a text label or icon, and check that the palette holds up in grayscale.

## Format constraints

A4, portrait, print-safe. Light backgrounds, no heavy ink blocks across large areas, since this may get printed physically. Consistent header and footer treatment: report title, client site, page number, and a confidentiality line. This is a print document laid out as pages, not a responsive web screen, so avoid patterns that only make sense with hover states or breakpoints.

Two full language versions are needed eventually, French and English, as separate PDFs rather than a single bilingual document. Design the French version as primary, since French is the expected common case, but confirm the layout has room for English strings running noticeably longer or shorter in the same slots (French legal and technical phrasing tends to run longer than English).

## Page by page content

### 1. Cover

Client site URL, audit date, report language, and the overall risk rating (low, medium, high) shown prominently as a single, plain-language badge, not buried in a paragraph. Wordmark, not a full logo lockup.

### 2. Executive summary

Plain-language paragraph summarizing what was found and why it matters, written for the non-technical reader. Include a short, separate "what to do first" block naming the two or three highest-priority actions in plain terms, this is the single most-read part of the report and should be scannable in under a minute.

**Tone note, added 2026-08-03.** The reader should come away reassured rather than alarmed: this is a full review they can act on, not a new problem sprung on them. Avoid phrasing that implies the work is already done, "keys in hand" style framing, since the service does not include remediation. Closer framing: a clear roadmap, prioritized, so they know exactly where to start. One reassuring line worth including here or in a closing block: the report is designed so the client or their existing developer can act on it directly, no specialized knowledge required to understand what to prioritize. This answers "so who fixes this" without implying Odysseus does.

### 3. Overall risk

Expands on the cover's risk badge with the reasoning behind it in one short paragraph plus a compact breakdown by category (accessibility, SEO, performance, rendering).

### 4. Prioritized themes

One card or block per theme, ranked. Each theme needs: a plain-language title, category tag, a business impact sentence, a legal relevance line (accessibility themes only, names the WCAG criterion and EN 301 549 without asserting the EAA definitely applies to this specific business), an effort rating (low, medium, high), an impact rating (low, medium, high), the affected pages, and a short list of recommended actions. Flag "quick win" themes visually, low effort and high impact is the combination a client can act on immediately.

Example theme, SEO category, for realistic content density:

```
Title (FR): Votre page de devis est invisible pour Google
Title (EN): Your quote request page is invisible to search engines
Category: seo
Business impact: This page cannot be found in search results, which
  means visitors looking for a quote never reach it.
Effort: low
Impact: high
Priority rank: 1
Affected pages: 1 (the quote request page)
Recommended actions: Remove the noindex directive currently set on
  this page.
Quick win: yes
```

Example theme, accessibility category:

```
Title (FR): Le texte du pied de page est illisible pour les
  malvoyants
Title (EN): Footer text fails color contrast requirements
Category: accessibility
Business impact: Visitors with low vision cannot read footer content,
  including contact information.
Legal relevance: WCAG 2.2 criterion 1.4.3 (Contrast Minimum),
  referenced by EN 301 549.
Effort: low
Impact: medium
Priority rank: 4
Affected pages: 9
Recommended actions: Increase the contrast ratio of footer text
  against its background to at least 4.5:1.
```

A real audit typically produces somewhere between 8 and 15 themes.

### 5. Render diff evidence

This is the single most visual, most sellable part of the report. Side by side or stacked before-and-after screenshots: what a non-JavaScript crawler sees (raw) versus what a real browser renders. Show this for the homepage plus a small number of the worst-affected pages, not every page scanned, so 2 to 4 page pairs is a realistic range. Each pair needs its page URL and a "percent of visible content missing from the raw page" figure.

Example rows:

```
Homepage: 0% missing (server-rendered, no problem)
Quote request page: 85% missing (client-rendered, search engines see
  almost nothing)
```

### 6. Core Web Vitals table

One row per page scanned, three columns: Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Total Blocking Time (TBT). Do not label this section "Core Web Vitals" alone if TBT is included, TBT is a lab diagnostic used as a stand-in for real-user responsiveness, not a Core Web Vital itself, and a developer reading the report will notice the mislabel. Either title the section "performance metrics" and show all three under their correct names, or keep a two-metric Core Web Vitals table (LCP, CLS) and place TBT in a clearly separate row or note below it. Include one short plain-language line explaining that real-user interaction responsiveness (INP) requires field data from actual visitors and cannot be measured by an automated scan.

Example rows:

```
Homepage: LCP 2.1s (good), CLS 0.05 (good), TBT 380ms
Quote request page: LCP 4.2s (poor), CLS 0.18 (poor), TBT 1240ms
```

### 7. Full findings appendix

Grouped by category (accessibility, SEO, performance, rendering), then by severity within each group. This is the technical, complete record, every finding the scan produced, not just the ones a theme covers. Each row: rule ID, severity (critical, serious, moderate, minor), WCAG criterion where applicable, a short title, number of occurrences, affected pages, and a capped code snippet or selector for the technical reader. A real appendix commonly runs 50 to 100 rows, so this table needs to read cleanly at length, not just as a three-row mockup.

Example rows:

```
color-contrast | accessibility | serious | WCAG 1.4.3 | 27 occurrences
  across 9 pages
text-missing-from-raw-html | rendering | critical | 85% missing |
  1 page
link-in-text-block | accessibility | moderate | WCAG 1.4.1 |
  69 occurrences on 1 page
```

### 8. Methodology and tooling statement

States what ran and how, for credibility and for defensibility of the accessibility claims specifically: axe-core and Lighthouse versions used, the WCAG tag set audited against (2.2 AA), the scan date, and the number of pages crawled. Plain, factual, no marketing tone here, this section exists so a skeptical developer can verify the audit was real.

### 9. Limitations statement

States plainly that automated scanning catches a well-documented minority of WCAG issues, commonly cited around 30 to 40 percent, and that keyboard navigation, focus order, alt text quality, form error handling, and media captions require manual checking. This section is a credibility and liability safeguard, it should read as confident and factual, not as an apology or a hedge.

## House style for all copy in the mockups

No em dashes or en dashes anywhere, use commas or separate sentences instead. Plain language throughout, expand any acronym or technical term on first use in a given section. Every piece of prose shown needs to work in both French and English versions, do not design a layout that only works for one language's sentence length.

## Explicitly out of scope for this Figma pass

No dashboard or web app UI, this brief is for the PDF report only. No exact print pagination, that logic lives in code against real content later. No client login, proposal page, or intake questionnaire, those are separate pieces of work.
