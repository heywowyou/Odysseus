/**
 * Receives the opt-out form. A plain HTML form post, so it works without
 * JavaScript, answered with a 303 back to the page. The address is never
 * logged and never put in the redirect URL.
 */

import {
  clientAddressOf,
  createSubmissionLimiter,
  isPlausibleEmail,
  isSameOriginPost,
  optOutStoreFromEnvironment,
} from '@/lib/opt-out';

export const dynamic = 'force-dynamic';

const limiter = createSubmissionLimiter();

function backTo(status: 'envoye' | 'invalide' | 'erreur'): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: `/desinscription?statut=${status}`, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return backTo('invalide');
  }
  // Honeypot: hidden from people, filled by naive bots.
  if (String(form.get('site') ?? '') !== '') return backTo('envoye');
  // Another site posting the form, or one client flooding it, gets the same
  // answer as a bot: nothing is written. An anonymous request only ever
  // suppresses the submitted address, so this bounds noise, not reach.
  if (!isSameOriginPost(request)) return backTo('invalide');
  if (!limiter.allow(clientAddressOf(request))) return backTo('erreur');

  const address = String(form.get('email') ?? '').trim();
  if (!isPlausibleEmail(address)) return backTo('invalide');
  const token = String(form.get('t') ?? '');

  try {
    await optOutStoreFromEnvironment().submit({
      address,
      ...(token === '' ? {} : { token }),
    });
  } catch {
    return backTo('erreur');
  }
  return backTo('envoye');
}
