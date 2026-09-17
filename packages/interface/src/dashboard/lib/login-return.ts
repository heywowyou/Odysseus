/** Issue #401: where the login page sends the operator back to. Only an
 *  in-app path is accepted: it must start with a single `/` (never `//` or
 *  `/\\`, which browsers read as another origin) and must not loop back to
 *  the login page itself. Anything else falls back to the dashboard home. */
export function safeReturnPath(raw: string | null): string {
  if (raw === null || !raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(raw)) return '/';
  if (raw === '/login' || raw.startsWith('/login/') || raw.startsWith('/login?')) return '/';
  return raw;
}

/** The login URL that returns to `current` (pathname + search + hash) after
 *  signing in; the home page needs no return target. */
export function loginUrlReturningTo(current: string): string {
  const target = safeReturnPath(current);
  return target === '/' ? '/login' : `/login?next=${encodeURIComponent(target)}`;
}
