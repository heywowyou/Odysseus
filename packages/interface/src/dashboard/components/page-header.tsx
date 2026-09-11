import type { JSX, ReactNode } from 'react';

/** How wide a page's content may run.
 *
 *  Two widths, because the dashboard does two different jobs. Forms and prose
 *  stay at a readable measure; the operator tables get the whole surface. The
 *  prospect list carries ten columns, and inside a reading column every row of
 *  it wrapped onto three lines with row heights varying by half, which made a
 *  scannable table unscannable. */
export type PageWidth = 'reading' | 'surface';

/** Applied to a route's own root element. The page header is already the
 *  first child of every route, so a wrapper component would add indirection
 *  without adding anything. */
export const PAGE_WIDTH: Record<PageWidth, string> = {
  reading: 'mx-auto w-full max-w-reading',
  surface: 'mx-auto w-full max-w-surface',
};

/** One consistent page opening: where this page sits in the pipeline, what it
 *  is about, the state of that thing, and the actions available on it. Every
 *  route opens with this, so an operator moving between pages reads the same
 *  four things in the same four places.
 *
 *  `subject` is the page's actual object - a domain, a job, a hotel - and is
 *  set in the identifier register, because it is a value the operator copies
 *  and compares rather than reads as prose. */
export function PageHeader({
  eyebrow,
  title,
  subject,
  description,
  meta,
  actions,
}: {
  /** A string title, or a breadcrumb built from a few inline elements (a
   *  link back to a parent list, a separator, the current section) when the
   *  page has one to show. */
  eyebrow?: ReactNode;
  title: string;
  subject?: string | undefined;
  description?: string | undefined;
  meta?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="mb-8 border-b border-line pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow !== undefined ? (
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              {eyebrow}
            </p>
          ) : null}
          {subject !== undefined ? (
            <p className="ident mb-1 truncate text-sm text-ink-soft">{subject}</p>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description !== undefined ? (
            <p className="mt-1 max-w-reading text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions !== undefined ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {meta !== undefined ? <div className="mt-4">{meta}</div> : null}
    </header>
  );
}
