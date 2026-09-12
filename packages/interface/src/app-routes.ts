/** Top-level path segments the dashboard SPA (dashboard/App.tsx) owns as
 *  client-side routes. Single source of truth for the static fallback's
 *  allowlist (routes/static.ts) so a route added to the router cannot
 *  silently 404 on refresh or a deep link because the fallback was never
 *  told about it. Keep this in sync with the top-level <Route path> values
 *  in dashboard/App.tsx whenever a route is added or removed. Plan 040
 *  slice 6: 'outreach' stays listed even though every one of its routes is
 *  now a redirect, so an old bookmark still reaches the SPA that serves it. */
export const APP_ROUTE_PREFIXES = [
  'audits',
  'scans',
  'login',
  'prospects',
  'outreach',
  'a-traiter',
  'resultats',
  'ne-pas-contacter',
] as const;
