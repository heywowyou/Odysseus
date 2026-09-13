# PDF-native report workbench

This is the agent runbook for editing the paid report or outreach preview with
Impeccable Live while judging the exact PDF output. Read it before starting or
resuming a report design session.

The workbench displays PNG pages rasterized from the production PDF. It does
not recreate the document as browser HTML. The operator therefore selects and
compares the real Paged.js pagination, embedded fonts, print rules, appendix
repairs, and PDF renderer output.

## Non-negotiable model

- The PDF is the review artifact.
- The page PNG is the Impeccable selection surface.
- `artifacts/*workbench/index.html` and `.impeccable/live/` are disposable
  session files, never durable design source.
- Accepted work must be implemented in `packages/report/src/template`,
  `packages/report/src/styles`, or the outreach-preview source that owns it.
- Always render the complete document for each option. Rendering an isolated
  HTML fragment can hide pagination changes.
- Do not launch a GUI browser. Give the operator the localhost URL to open in
  their default browser. The report pipeline may use its normal headless PDF
  renderer internally.
- Do not claim an option is accepted until an Impeccable `accept` event names
  its variant id.
- Do not commit generated PDFs, page PNGs, workbench HTML, or
  `.impeccable/live/` scratch unless the operator explicitly requests those
  artifacts.

## Start the exact-PDF surfaces

Inspect the tree first and preserve unrelated work. Start the full report from
the canonical stress fixture:

```bash
pnpm run report:workbench
```

It generates the production PDF, rasterizes every page, serves only
`artifacts/report-workbench`, and prints these default URLs:

```text
http://localhost:4173/
http://localhost:4173/report.pdf
```

To review an existing PDF without regenerating it:

```bash
pnpm run report:workbench -- --pdf artifacts/example/report.pdf
```

Use a separate output directory and port when the full report and outreach
preview must stay open together:

```bash
pnpm run report:workbench -- \
  --pdf artifacts/example/outreach-preview.pdf \
  --output artifacts/preview-workbench \
  --port 4174
```

Keep each workbench process running. Never substitute Impeccable's helper port
for the workbench URL.

## Attach Impeccable Live

The local config should cover both workbenches:

```json
{
  "files": ["artifacts/*workbench/index.html"],
  "insertBefore": "</body>",
  "commentSyntax": "html",
  "cspChecked": true
}
```

Start Impeccable against the full-report workbench:

```bash
.agents/skills/impeccable/scripts/impeccable live \
  --target artifacts/report-workbench/index.html
```

Tell the operator to open `http://localhost:4173/` in their own browser. Do
not open Chromium for them. Then keep the required foreground poll serviced:

```bash
.agents/skills/impeccable/scripts/impeccable live-poll
```

Run `live-poll` again immediately after every event or reply. If a session was
interrupted, run `live-status`, then `live-resume` when needed; do not ask the
operator to repeat a recorded instruction.

## Handle a page instruction

An Impeccable event selects an `img` such as `pdf-page-6`. Its number is the
physical PDF page to modify.

1. Read the event prompt and the selected page number. If the event has no
   annotation screenshot, use the event metadata and prompt; do not create a
   substitute browser screenshot.
2. Run the exact `live-wrap` command from the event `_instructions`. A
   generated-file fallback is expected because the workbench is deliberately
   not source.
3. Identify the real template and CSS that produce the selected page. Use the
   PDF text, section ids, strings, and render order rather than assuming that
   physical page N always maps to one fixed section.
4. Extract the incumbent report identity before designing: near-navy ground,
   Avenir Next, sky accent, existing severity palette, restrained hairlines,
   and A4 print hierarchy. Read the Impeccable craft floor and preserve report
   design-system constraints.
5. Build the requested number of genuinely different options. Keep speculative
   CSS or generation scripts under `.impeccable/live/`; add stable semantic
   classes to real templates when positional selectors would be brittle.
6. For every option, render the complete document through
   `renderPdfWithPageCountFromHtml()`, then rasterize the affected physical
   page. A typical raster command is:

   ```bash
   pdftoppm -png -r 144 -f 6 -l 6 -singlefile \
     artifacts/report-variants/option-1.pdf \
     artifacts/report-workbench/pages/page-06-v1
   ```

7. Replace the selected page image in the generated workbench with one
   `data-impeccable-variants` wrapper containing the rasterized options. Each
   variant contains exactly one `img`; option 1 is visible and the rest start
   with `style="display: none"`. Publish all options atomically.
8. Raster images cannot support truthful live CSS parameters. Do not add knobs
   that change nothing. If tuning is needed, render another concrete PDF
   option or regenerate the selected option from a real source parameter.
9. Reply with the generated workbench file, then resume polling:

   ```bash
   .agents/skills/impeccable/scripts/impeccable live-poll \
     --reply EVENT_ID done \
     --file artifacts/report-workbench/index.html
   .agents/skills/impeccable/scripts/impeccable live-poll
   ```

The operator now switches instantly between PDF-exact page images in the
yellow overlay.

## Accept, discard, and persist

For an `accept` event:

1. Record the accepted variant id from the event.
2. Expect mechanical accept to refuse the generated workbench file. This is a
   safety feature, not a failure.
3. Translate only the accepted direction into durable semantic template and
   stylesheet changes. Preserve French and English behavior and all mandatory
   legal/disclaimer copy.
4. Remove the temporary wrapper by regenerating the workbench from the updated
   source. Do not hand-promote the generated HTML.
5. Render the complete production PDF again and inspect the accepted physical
   page. Confirm that the page count and neighboring page flow are sound.
6. Finish any accept acknowledgement required by the event `_instructions`,
   then resume polling.

For a `discard` event, remove the temporary wrapper or regenerate the
workbench, keep no speculative source styling, acknowledge the event, and
resume polling.

## Verification after acceptance

Use the narrow tests for the changed template first, then the report gates
appropriate to layout risk. The usual set is:

```bash
pnpm exec vitest run packages/report/src/template/sections/CHANGED.test.ts
pnpm --filter @odysseus/report run typecheck
pnpm exec eslint packages/report/src/template packages/report/src/styles
pnpm exec vitest run --project e2e \
  packages/report/src/template/render-html.axe.e2e.test.ts \
  packages/report/src/template/paged-invariants.e2e.test.ts \
  packages/report/src/template/pdf-overflow-gate.e2e.test.ts
pnpm run docs:check
```

Use the preview axe test instead when the accepted change belongs only to the
outreach preview. Also confirm the final PDF with `pdfinfo` and, when text or
reading order changed, `pdftotext`.

## Commit the accepted source

Commit only after the accepted PDF has been regenerated and the relevant
checks pass. Inspect the diff and stage explicit source, test, and canonical
documentation paths. Never use `git add .` in a live-design checkout because
it risks staging session scratch and unrelated operator work.

```bash
git status --short
git diff -- packages/report/src docs/report package.json scripts/report-workbench.ts
git add \
  packages/report/src/template/sections/CHANGED.ts \
  packages/report/src/template/sections/CHANGED.test.ts \
  packages/report/src/styles/nocturne.css \
  docs/report/report-design-system.md
git diff --cached --check
git commit -m "Refine the report severity summary"
```

Adjust the explicit paths to the accepted change. Do not add model credits to
the commit. If the operator did not authorize a commit in the current request,
leave the verified source changes uncommitted and report the exact paths.

## Copy-paste instruction for a fresh agent

```text
Use the explicit Impeccable skill and follow
docs/report/report-workbench.md. Work against the PDF-native localhost
workbench, not the report HTML. Do not open Chromium or another GUI browser;
give me the localhost URL for my default browser. Keep Impeccable live-poll
actively serviced and recover existing durable events before asking me to
repeat anything. For every requested option, render the complete production
PDF, rasterize the selected physical page, and publish those page images as
the Impeccable variants. When I accept an option, implement only that option
in the real report template/styles, regenerate the full PDF/workbench, run the
focused unit, type, accessibility, pagination, overflow, and docs checks, then
commit only the accepted source/test/doc changes with explicit git paths.
Never commit artifacts/ or .impeccable/live/ scratch and never add model
credit. Preserve unrelated work in the dirty tree.
```
