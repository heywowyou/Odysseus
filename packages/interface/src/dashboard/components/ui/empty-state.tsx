import type { JSX, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState(props: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  const { icon: Icon, title, description, action } = props;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-panel/60 p-10 text-center">
      {Icon ? <Icon className="size-6 text-ink-muted" aria-hidden="true" /> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
