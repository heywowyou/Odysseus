import type { JSX } from 'react';
import { Info } from 'lucide-react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/** Inline hint next to pipeline vocabulary (the i18n `hints` table). The
 *  trigger is a real button: keyboard focus opens the hint exactly like a
 *  pointer hover does, and the portal content carries role="tooltip" with
 *  the trigger's aria-describedby, so screen readers keep the hint too. The
 *  portal also escapes the tables' overflow-hidden wrappers, which is why
 *  the old title-only span never grew a CSS popover. */
export function InfoTip({ label, hint }: { label: string; hint: string }): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          type="button"
          aria-label={label}
          className="inline-flex items-center rounded-sm p-0.5 align-middle text-ink-muted transition-colors hover:text-ink-soft"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={4}
            className="z-50 max-w-72 rounded-md border border-line-strong bg-overlay px-2.5 py-1.5 text-xs text-ink shadow-xl"
          >
            {hint}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
