import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { Button } from './button';

export function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  const { open, onOpenChange, children } = props;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent(props: { children: ReactNode }): JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-overlay-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-line-strong bg-panel p-6 shadow-xl focus:outline-none',
          'data-[state=open]:animate-content-in',
        )}
      >
        {props.children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle(props: { children: ReactNode }): JSX.Element {
  return (
    <DialogPrimitive.Title className="text-base font-semibold text-ink">
      {props.children}
    </DialogPrimitive.Title>
  );
}

function DialogDescription(props: { children: ReactNode }): JSX.Element {
  return (
    <DialogPrimitive.Description className="mt-1 text-sm text-ink-soft">
      {props.children}
    </DialogPrimitive.Description>
  );
}

function DialogFooter(props: { children: ReactNode }): JSX.Element {
  return <div className="mt-6 flex justify-end gap-2">{props.children}</div>;
}

export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  const { open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm } = props;
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setIsPending(true);
    try {
      await onConfirm();
    } finally {
      // Close even on error: the caller owns error reporting.
      setIsPending(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button variant="secondary" disabled={isPending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            isLoading={isPending}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
