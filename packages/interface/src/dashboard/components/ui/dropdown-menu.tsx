import type { JSX, ReactNode } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn';

export function DropdownMenu(props: { children: ReactNode }): JSX.Element {
  return <DropdownMenuPrimitive.Root>{props.children}</DropdownMenuPrimitive.Root>;
}

export function DropdownMenuTrigger(props: { children: ReactNode }): JSX.Element {
  return <DropdownMenuPrimitive.Trigger asChild>{props.children}</DropdownMenuPrimitive.Trigger>;
}

export function DropdownMenuContent(props: { children: ReactNode }): JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content className="z-50 min-w-44 rounded-lg border border-line-strong bg-overlay p-1 shadow-xl">
        {props.children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem(props: { children: ReactNode }): JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5',
        'text-sm text-ink-soft outline-none',
        'focus:bg-raised focus:text-ink',
      )}
    >
      {props.children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator(): JSX.Element {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />;
}
