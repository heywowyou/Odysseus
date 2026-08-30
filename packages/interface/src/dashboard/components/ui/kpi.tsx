import type { JSX } from 'react';
import { cn } from '../../lib/cn';

export function KpiTile(props: {
  label: string;
  value: string | number;
  tone?: 'default' | 'critical';
  className?: string;
}): JSX.Element {
  const { label, value, tone = 'default', className } = props;
  return (
    <div className={cn('rounded-xl border border-line bg-panel px-4 py-3', className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tracking-tight',
          tone === 'critical' ? 'text-sev-critical' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}
