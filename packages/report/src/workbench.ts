export interface ReportWorkbenchPage {
  number: number;
  imagePath: string;
}

export interface ReportWorkbenchHtmlInput {
  title: string;
  pdfPath: string;
  pages: readonly ReportWorkbenchPage[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Builds the operator-only shell used for Impeccable report work. The page
 * images are rasterized from the production PDF, so the selectable surface is
 * the artifact itself rather than a second HTML approximation of it.
 */
export function renderReportWorkbenchHtml(input: ReportWorkbenchHtmlInput): string {
  const title = escapeHtml(input.title);
  const pdfPath = escapeHtml(input.pdfPath);
  const pageCount = input.pages.length;
  const pages = input.pages
    .map(
      (page) => `
        <figure class="pdf-page" id="page-${page.number}">
          <figcaption>Page ${page.number} / ${pageCount}</figcaption>
          <img
            id="pdf-page-${page.number}"
            data-pdf-page="${page.number}"
            src="${escapeHtml(page.imagePath)}"
            alt="Page ${page.number} sur ${pageCount} du PDF ${title}"
            width="1191"
            height="1684"
          />
        </figure>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${title} · Atelier PDF</title>
    <style>
      :root {
        color-scheme: dark;
        --ground: #080d13;
        --panel: #111923;
        --line: rgb(233 238 245 / 0.14);
        --ink: #e9eef5;
        --muted: #96a2b0;
        --accent: #38bdf8;
        --page-width: min(210mm, calc(100vw - 32px));
        --zoom: 1;
        font-family: "Avenir Next", ui-sans-serif, system-ui, sans-serif;
      }
      * { box-sizing: border-box; }
      html { background: var(--ground); scroll-behavior: smooth; }
      body { margin: 0; color: var(--ink); background: var(--ground); }
      ::selection { color: var(--ground); background: var(--accent); }
      :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
      .toolbar {
        position: sticky;
        z-index: 20;
        top: 0;
        display: flex;
        min-height: 52px;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 8px 18px;
        border-bottom: 1px solid var(--line);
        background: color-mix(in srgb, var(--ground) 94%, transparent);
        backdrop-filter: blur(12px);
      }
      .title-group { min-width: 0; }
      h1 {
        overflow: hidden;
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.35;
        letter-spacing: -0.015em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
      .actions { display: flex; flex: none; align-items: center; gap: 8px; }
      button, .pdf-link {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 6px;
        color: var(--ink);
        background: var(--panel);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      button:hover, .pdf-link:hover { border-color: rgb(56 189 248 / 0.55); }
      .pages {
        display: grid;
        justify-items: center;
        gap: 28px;
        padding: 32px 16px 72px;
        overflow: auto;
      }
      .pdf-page {
        width: calc(var(--page-width) * var(--zoom));
        margin: 0;
      }
      figcaption {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .pdf-page img {
        display: block;
        width: 100%;
        height: auto;
        background: #0e141c;
        box-shadow: 0 10px 38px color-mix(in srgb, var(--ground) 78%, transparent);
      }
      @media (max-width: 640px) {
        .toolbar { align-items: flex-start; padding: 10px 12px; }
        .status { display: none; }
        .actions button { display: none; }
        .pages { gap: 18px; padding: 20px 8px 48px; }
      }
      @media (prefers-reduced-motion: reduce) {
        html { scroll-behavior: auto; }
        .pdf-page { transition: none; }
      }
    </style>
  </head>
  <body>
    <header class="toolbar">
      <div class="title-group">
        <h1>${title}</h1>
        <p class="status">Pixels du PDF réel · ${pageCount} pages · Sélectionnez une page pour l’annoter</p>
      </div>
      <div class="actions" aria-label="Commandes de l’atelier PDF">
        <button type="button" data-zoom="out" aria-label="Réduire le zoom">−</button>
        <button type="button" data-zoom="reset">100 %</button>
        <button type="button" data-zoom="in" aria-label="Augmenter le zoom">+</button>
        <a class="pdf-link" href="${pdfPath}" target="_blank" rel="noreferrer">Ouvrir le PDF</a>
      </div>
    </header>
    <main class="pages">${pages}
    </main>
    <script>
      (() => {
        let zoom = 1;
        const root = document.documentElement;
        const reset = document.querySelector('[data-zoom="reset"]');
        const update = (next) => {
          zoom = Math.min(1.5, Math.max(0.6, next));
          root.style.setProperty('--zoom', String(zoom));
          if (reset) reset.textContent = Math.round(zoom * 100) + ' %';
        };
        document.querySelector('[data-zoom="out"]')?.addEventListener('click', () => update(zoom - 0.1));
        document.querySelector('[data-zoom="in"]')?.addEventListener('click', () => update(zoom + 0.1));
        reset?.addEventListener('click', () => update(1));
      })();
    </script>
  </body>
</html>`;
}
