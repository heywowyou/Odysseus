import type { ButtonHTMLAttributes, JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/* Dark text on the violet primary keeps the label at WCAG AA contrast. */
const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-[#101117] hover:bg-[#9d99f6]',
  secondary: 'border border-line-strong bg-raised text-ink hover:bg-overlay',
  ghost: 'text-ink-soft hover:bg-raised hover:text-ink',
  danger: 'border border-danger/40 bg-transparent text-danger hover:bg-danger/10',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-sm',
};

export function buttonStyles(variant?: ButtonVariant, size?: ButtonSize): string {
  return cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    VARIANT_STYLES[variant ?? 'primary'],
    SIZE_STYLES[size ?? 'md'],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant, size, isLoading = false, className, children, disabled, ...rest } = props;
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={cn(buttonStyles(variant, size), className)}
      {...rest}
    >
      {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
