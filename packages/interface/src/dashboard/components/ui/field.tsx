import type { JSX, ReactNode } from 'react';

export function Field(props: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}): JSX.Element {
  const { label, htmlFor, hint, error, children } = props;
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
      {error ? (
        <p
          {...(htmlFor !== undefined ? { id: `${htmlFor}-error` } : {})}
          className="mt-1.5 text-xs text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
