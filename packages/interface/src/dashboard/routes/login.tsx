import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { fetchWithTimeout } from '../lib/api';
import type { DashboardStrings } from '../i18n/types';

/** Human wait ("3 min 20 s") substituted into errorLocked's {wait} slot,
 *  with the unit words kept in the string tables so they translate. A
 *  non-positive or malformed retryAfterSeconds collapses to seconds. */
function formatRetryWait(seconds: number, copy: DashboardStrings['login']): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  if (minutes > 0 && rest > 0) {
    return copy.waitMinutesSeconds
      .replace('{minutes}', String(minutes))
      .replace('{seconds}', String(rest));
  }
  if (minutes > 0) return copy.waitMinutes.replace('{minutes}', String(minutes));
  return copy.waitSeconds.replace('{seconds}', String(safeSeconds));
}

/** Parses the JSON error body without trusting its shape; the login route
 *  only reacts to fields the session contract actually defines. */
function readLoginError(body: unknown): { error: string | null; retryAfterSeconds: number | null } {
  if (typeof body !== 'object' || body === null) return { error: null, retryAfterSeconds: null };
  const record = body as Record<string, unknown>;
  return {
    error: typeof record.error === 'string' ? record.error : null,
    retryAfterSeconds:
      typeof record.retryAfterSeconds === 'number' ? record.retryAfterSeconds : null,
  };
}

export function LoginPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.login;
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Raw fetch instead of lib/api.ts on purpose: a 204 carries no body for
  // fetchJson to parse, and a 401 here means a wrong password, not the
  // expired-session redirect the shared helper performs.
  const submit = async (): Promise<void> => {
    try {
      const response = await fetchWithTimeout('/api/session/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 204) {
        // Hard navigation so the app remounts with the session cookie.
        window.location.assign('/');
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const { error, retryAfterSeconds } = readLoginError(body);
      if (response.status === 401) {
        setErrorText(copy.errorInvalid);
      } else if (response.status === 429) {
        const wait = formatRetryWait(retryAfterSeconds ?? 0, copy);
        setErrorText(copy.errorLocked.replace('{wait}', wait));
      } else if (response.status === 400 && error === 'auth-not-configured') {
        setErrorText(copy.errorNotConfigured);
      } else {
        setErrorText(copy.errorNetwork);
      }
    } catch {
      setErrorText(copy.errorNetwork);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorText(null);
    setIsSubmitting(true);
    void submit();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-base px-4 text-ink">
      <div className="w-full max-w-sm">
        {/* The front door was anonymous: the same nameplate the shell wears
            is the cheapest way to make it obviously this tool and not a
            generic password box. */}
        <div className="mb-6 text-center">
          <p className="text-[26px] font-semibold uppercase tracking-[0.22em] text-ink">Odysseus</p>
          <p className="mt-1 text-sm text-ink-muted">{strings.shell.tagline}</p>
        </div>
        <Card>
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <h1 className="text-sm font-medium text-ink-soft">{copy.title}</h1>
            <Field
              label={copy.passwordLabel}
              htmlFor="login-password"
              {...(errorText !== null ? { error: errorText } : {})}
            >
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              {isSubmitting ? copy.submitting : copy.submit}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
