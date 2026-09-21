'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useLanguage, type SiteLanguage } from './language';
import {
  applyStep,
  clampPage,
  fittedPageWidth,
  pageHash,
  parsePageHash,
  sectionEntries,
  sectionForPage,
  stepForKey,
  stepForSwipe,
  type OutlineEntry,
  type PageStep,
} from './report-viewer-state';

/**
 * One-page-at-a-time reader for the permanent example report.
 *
 * The approved PDF stays the only published artifact: pdf.js draws the
 * current page onto a canvas and lays its real text over it (the text
 * layer), so the page is selectable, searchable with the browser's own
 * find, and read by screen readers rather than being an image of text.
 * The canvas itself is hidden from assistive technology for that reason.
 *
 * pdf.js is loaded only in the browser, after the page is interactive, and
 * its worker is a same-origin bundle chunk, so the marketing CSP
 * (default-src 'self', no eval; pdf.js 6 never evaluates code) holds
 * unchanged.
 */

const COPY: Record<
  SiteLanguage,
  {
    region: string;
    previous: string;
    next: string;
    section: string;
    page: (page: number, count: number) => string;
    loading: string;
    error: string;
    download: string;
  }
> = {
  fr: {
    region: 'Exemple de rapport, page par page',
    previous: 'Page précédente',
    next: 'Page suivante',
    section: 'Aller à la section',
    page: (page, count) => `Page ${page} sur ${count}`,
    loading: 'Chargement du rapport…',
    error: "Le rapport ne peut pas être affiché ici pour le moment. Vous pouvez l'ouvrir en PDF.",
    download: 'Télécharger le PDF',
  },
  en: {
    region: 'Example report, page by page',
    previous: 'Previous page',
    next: 'Next page',
    section: 'Go to section',
    page: (page, count) => `Page ${page} of ${count}`,
    loading: 'Loading the report…',
    error: 'The report cannot be shown here right now. You can open it as a PDF.',
    download: 'Download the PDF',
  },
};

/** Breathing space kept under the sheet when it is fitted to the window. */
const SHEET_MARGIN = 24;

type LoadState = 'loading' | 'ready' | 'error';

async function loadOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const outline = await doc.getOutline();
  if (!outline) return [];
  const entries: OutlineEntry[] = [];
  const visit = async (items: typeof outline, depth: number): Promise<void> => {
    for (const item of items) {
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        const target = dest?.[0];
        if (target && typeof target === 'object') {
          entries.push({ title: item.title, page: (await doc.getPageIndex(target)) + 1, depth });
        } else if (typeof target === 'number') {
          entries.push({ title: item.title, page: target + 1, depth });
        }
      } catch {
        // An unresolvable bookmark is skipped; paging still works.
      }
      if (depth < 1 && item.items.length > 0) await visit(item.items, depth + 1);
    }
  };
  // Chromium's heading-derived outline nests everything under the cover's
  // single title; that root is the first page, its children the sections.
  const [root] = outline;
  if (outline.length === 1 && root && root.items.length > 0) {
    entries.push({ title: root.title, page: 1, depth: 0 });
    await visit(root.items, 0);
  } else {
    await visit(outline, 0);
  }
  return sectionEntries(entries);
}

export function ReportViewer({ src }: { src: string }) {
  const { language } = useLanguage();
  const copy = COPY[language];

  const rootRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [sections, setSections] = useState<OutlineEntry[]>([]);
  const [width, setWidth] = useState(0);
  // First sheet's size in PDF points; every report page is the same A4.
  const [sheet, setSheet] = useState({ width: 595.28, height: 841.89 });

  // Load pdf.js and the document once.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let worker: Worker | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), {
          type: 'module',
        });
        pdfjs.GlobalWorkerOptions.workerPort = worker;
        loadingTask = pdfjs.getDocument({ url: src });
        const loaded = await loadingTask.promise;
        if (cancelled) return;
        const first = await loaded.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const sectionList = await loadOutline(loaded).catch(() => []);
        if (cancelled) return;
        setSheet({ width: base.width, height: base.height });
        setPageCount(loaded.numPages);
        setSections(sectionList);
        setPage(clampPage(parsePageHash(window.location.hash) ?? 1, loaded.numPages));
        setDoc(loaded);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      worker?.terminate();
    };
  }, [src]);

  // Size the sheet to the frame and the window.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // The sticky site header and the controls bar both sit above the sheet
    // once the viewer is scrolled into place.
    const header = document.querySelector<HTMLElement>('.site-header');
    const measure = () =>
      setWidth(
        fittedPageWidth({
          frameWidth: frame.clientWidth,
          availableHeight:
            window.innerHeight -
            (header?.offsetHeight ?? 0) -
            (barRef.current?.offsetHeight ?? 0) -
            SHEET_MARGIN * 2,
        }),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Draw the current page and its text layer.
  useEffect(() => {
    if (!doc || width === 0) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: { cancel(): void } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: width / base.width });
        // Oversample beyond the device ratio so pinch-zoom stays sharp.
        const ratio = Math.max(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.setAttribute('aria-hidden', 'true');
        renderTask = pdfPage.render({
          canvas,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;
        canvasHostRef.current?.replaceChildren(canvas);

        const container = textLayerRef.current;
        if (!container) return;
        container.replaceChildren();
        const layer = new pdfjs.TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container,
          viewport,
        });
        textLayer = layer;
        await layer.render();
      } catch {
        // A cancelled render rejects; a real failure leaves the previous
        // sheet in place rather than blanking the viewer.
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, width]);

  // Keep the address shareable without adding history entries per page.
  useEffect(() => {
    if (state !== 'ready') return;
    const url = new URL(window.location.href);
    url.hash = pageHash(page);
    window.history.replaceState(window.history.state, '', url);
  }, [page, state]);

  const goTo = useCallback(
    (next: number) => {
      setPage(clampPage(next, pageCount));
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) rootRef.current?.scrollIntoView({ block: 'start' });
    },
    [pageCount],
  );

  const step = useCallback(
    (direction: PageStep) => goTo(applyStep(page, direction, pageCount)),
    [goTo, page, pageCount],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (state !== 'ready' || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('select, input, textarea')) return;
    const direction = stepForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    step(direction);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    swipeStart.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || state !== 'ready') return;
    const direction = stepForSwipe(event.clientX - start.x, event.clientY - start.y);
    if (direction) step(direction);
  };

  const current = sectionForPage(sections, page);
  const ready = state === 'ready';

  return (
    <section
      ref={rootRef}
      className="report-viewer"
      aria-label={copy.region}
      onKeyDown={onKeyDown}
    >
      <div ref={barRef} className="report-viewer-bar">
        <button
          type="button"
          className="report-viewer-step"
          onClick={() => step('previous')}
          disabled={!ready || page <= 1}
        >
          <span aria-hidden="true">←</span>
          <span className="report-viewer-step-label">{copy.previous}</span>
        </button>

        <p className="report-viewer-count numeric" aria-live="polite" aria-atomic="true">
          {ready ? copy.page(page, pageCount) : state === 'loading' ? copy.loading : ''}
          <span className="sr-only">{ready && current ? `, ${current.title}` : ''}</span>
        </p>

        <button
          type="button"
          className="report-viewer-step"
          onClick={() => step('next')}
          disabled={!ready || page >= pageCount}
        >
          <span className="report-viewer-step-label">{copy.next}</span>
          <span aria-hidden="true">→</span>
        </button>

        {sections.length > 1 ? (
          <label className="report-viewer-sections">
            <span className="sr-only">{copy.section}</span>
            <select
              value={current?.page ?? ''}
              onChange={(event) => goTo(Number(event.target.value))}
              disabled={!ready}
            >
              {current === null ? <option value="">{copy.section}</option> : null}
              {sections.map((entry) => (
                <option key={entry.page} value={entry.page}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div ref={frameRef} className="report-viewer-frame">
        {state === 'error' ? (
          <div className="report-viewer-fallback">
            <p>{copy.error}</p>
            <a className="btn btn-secondary mt-4" href={src}>
              {copy.download}
            </a>
          </div>
        ) : (
          <div
            className="report-viewer-sheet"
            data-state={state}
            lang="fr"
            tabIndex={ready ? 0 : -1}
            aria-label={ready ? copy.page(page, pageCount) : undefined}
            role={ready ? 'group' : undefined}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            style={
              {
                width: width > 0 ? `${width}px` : undefined,
                aspectRatio: `${sheet.width} / ${sheet.height}`,
                // Read by pdf.js's text layer to size its spans.
                '--total-scale-factor': width > 0 ? `${width / sheet.width}` : '1',
                '--scale-round-x': '1px',
                '--scale-round-y': '1px',
              } as React.CSSProperties
            }
          >
            <div ref={canvasHostRef} className="report-viewer-canvas" />
            <div ref={textLayerRef} className="textLayer" />
          </div>
        )}
      </div>
    </section>
  );
}
