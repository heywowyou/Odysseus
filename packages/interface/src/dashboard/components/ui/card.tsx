import type { JSX, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card(props: {
  id?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const { id, title, description, actions, className, children } = props;
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <section id={id} className={cn('rounded-xl border border-line bg-panel', className)}>
      {hasHeader ? (
        <div className="flex items-center justify-between gap-4 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="text-xs text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
