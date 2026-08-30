import type { JSX, MouseEventHandler, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Table({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }): JSX.Element {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }): JSX.Element {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLTableRowElement>;
}): JSX.Element {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-line last:border-b-0',
        onClick !== undefined && 'cursor-pointer transition-colors hover:bg-raised/40',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <th className={cn('px-3 py-2 text-left text-xs font-medium text-ink-muted', className)}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <td className={cn('px-3 py-2.5 align-middle text-ink-soft', className)}>{children}</td>;
}
