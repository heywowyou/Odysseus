/**
 * Milestone 8 (extended accessibility pass): form-error-not-associated.
 * By far the most safety-sensitive check in this codebase - everything
 * else only reads DOM state or, at most, presses Tab. This one
 * deliberately triggers form validation on a real, unknown, possibly
 * live client site. Read this whole comment before changing anything
 * here.
 *
 * Two layers of protection, both required, neither sufficient alone:
 *
 * 1. Never click the submit button, never call form.submit() or
 *    form.requestSubmit(). Those are the only things that trigger a
 *    browser's real "submit this form" machinery (network request or
 *    navigation). Instead: call reportValidity() (spec-guaranteed to
 *    only run constraint validation and show the native UI hint, never
 *    submit) and, separately, dispatch a synthetic 'submit' Event via
 *    element.dispatchEvent(). A script-dispatched event is never
 *    "trusted" (isTrusted: false), and per the HTML spec only a trusted
 *    submit reaches the browser's actual submission algorithm - a
 *    dispatched event only reaches the page's own addEventListener('submit',
 *    ...) handlers, which is exactly what needs to run to observe real
 *    custom validation logic.
 *
 * 2. That still leaves one narrow gap: a form with no client-side
 *    validation gate at all could have a submit handler that
 *    unconditionally calls fetch()/XHR regardless of field values,
 *    dispatched event or not - JavaScript does not care whether an event
 *    was user-triggered once it is running. So the page's own network
 *    entry points (fetch, XMLHttpRequest.send, navigator.sendBeacon) are
 *    replaced with inert stubs for the exact window this check triggers
 *    and inspects validation, and restored immediately after. A request
 *    that is never created cannot race anything.
 *
 * 3. Every network request is also blocked at the browser level
 *    (page.route('**\/*', route => route.abort())) across the same
 *    window, as a backstop for anything layer 2 cannot see: a handler
 *    that captured a reference to the real fetch before this check ran,
 *    or one that defers its call past the stub window.
 *
 *    The route is held until the page goes quiet, not torn down the
 *    instant page.evaluate() resolves. That teardown was the safety net's
 *    own leak: a request is not delivered to Playwright's interception
 *    layer at the moment the page calls fetch(), so the finally block
 *    could unroute the block away while a real submission was still in
 *    flight, and it reached the network for real.
 *
 *    Two measurements, both against a form modelled on the one this
 *    check exists to handle (issue 16). A handler calling fetch()
 *    synchronously escaped 5 times in one batch of 40 runs and 0 times
 *    in four further batches - real, but too load-dependent to test
 *    against. A handler whose call lands 50 ms later escaped 10 times
 *    out of 10 with the immediate unroute and 0 out of 10 with this
 *    window, which is the deterministic form the e2e regression guard
 *    uses. Do not shorten this window back to an immediate unroute.
 *
 * Required fields are left empty on purpose - never filled with
 * placeholder or fake data, which would risk a *valid-looking* submission
 * slipping past a validator that only checks presence, not content.
 */

import type { Page } from 'playwright';

export interface FormFieldCheckResult {
  selector: string;
  /** A field's computed border/background/outline color changed after
   *  triggering validation - the "something visibly happened" signal
   *  the description text is judged against. */
  visuallyChanged: boolean;
  ariaInvalidTrue: boolean;
  /** aria-describedby points at an element that actually has text in it
   *  after triggering. */
  hasAssociatedErrorText: boolean;
  /** A role="alert" or aria-live region exists anywhere in the same
   *  form after triggering. Attributed to every field in that form,
   *  since a single alert region commonly covers a whole form rather
   *  than one field. */
  hasAlertRegionInForm: boolean;
}

export interface FormCheckResult {
  formSelector: string;
  fields: FormFieldCheckResult[];
}

export interface FormErrorHandlingExtraction {
  pageUrl: string;
  forms: FormCheckResult[];
}

/** How long the request-blocking route must see no traffic at all before
 *  it is safe to tear down, and the hard ceiling on waiting for that.
 *  Bounded best-effort on the same reasoning as the render-diff settle
 *  wait (CLAUDE.md trade-off 31): a real page can always emit one more
 *  request, so this waits for quiet rather than for a guarantee, and
 *  gives up rather than hanging a scan. */
const REQUEST_BLOCK_QUIET_MS = 150;
const REQUEST_BLOCK_MAX_SETTLE_MS = 1_000;

export async function checkFormErrorHandling(
  page: Page,
  pageUrl: string,
  signal?: AbortSignal,
): Promise<FormErrorHandlingExtraction> {
  if (signal?.aborted) throw new Error('form-error-handling aborted');
  let lastBlockedAt = 0;
  let triggeredAnyForm = false;
  await page.route('**/*', (route) => {
    lastBlockedAt = Date.now();
    // The page can be closed out from under an in-flight abort; that is a
    // torn-down context, not a failed block.
    void route.abort().catch(() => {});
  });
  try {
    if (signal?.aborted) throw new Error('form-error-handling aborted');
    const forms = await page.evaluate(() => {
      const ATTR = 'data-odysseus-field-id';

      // Layer 2 (see this module's file-level comment). Stubs are installed
      // and restored inside this one evaluate call so the window is exactly
      // the synchronous trigger, and so a throw anywhere below can never
      // leave a real client page with its network entry points replaced.
      // Inlined rather than factored into helpers, for the page.evaluate()
      // serialization reason the field-visibility block notes below.
      const realFetch = window.fetch;
      const realSend = XMLHttpRequest.prototype.send;
      const realBeacon = navigator.sendBeacon;
      window.fetch = (() =>
        Promise.reject(new Error('blocked during accessibility audit'))) as typeof fetch;
      XMLHttpRequest.prototype.send = function () {};
      try {
        navigator.sendBeacon = () => false;
      } catch {
        // Non-writable on some engines; the route in layer 3 still covers it.
      }

      try {
        const results: Array<{
          formSelector: string;
          fields: Array<{
            selector: string;
            visuallyChanged: boolean;
            ariaInvalidTrue: boolean;
            hasAssociatedErrorText: boolean;
            hasAlertRegionInForm: boolean;
          }>;
        }> = [];

        const forms = Array.from(document.querySelectorAll('form'));
        forms.forEach((form, formIndex) => {
          // isVisible/isEmpty are inlined rather than pulled out as named
          // helpers - see keyboard-navigation.ts's identical comment on
          // this same page.evaluate() serialization pitfall under tsx's
          // --keep-names dev runtime.
          const requiredFields = Array.from(
            form.querySelectorAll('[required], [aria-required="true"]'),
          ).filter((el) => {
            const rect = el.getBoundingClientRect();
            const visible =
              rect.width > 0 &&
              rect.height > 0 &&
              getComputedStyle(el).visibility !== 'hidden' &&
              getComputedStyle(el).display !== 'none';
            if (!visible || el.hasAttribute('disabled')) return false;
            if (el instanceof HTMLSelectElement) return el.value === '';
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
              return el.value.trim() === '';
            return false;
          });
          if (requiredFields.length === 0) return;

          const beforeStyles = requiredFields.map((el) => {
            const style = getComputedStyle(el);
            return `${style.borderColor}|${style.backgroundColor}|${style.outlineColor}`;
          });

          requiredFields.forEach((el, i) => el.setAttribute(ATTR, String(i)));

          // Never navigates, never submits over the network - see this
          // module's file-level doc comment for why both calls below are
          // safe, and why the request-blocking route wrapped around this
          // whole function is still needed as a second layer regardless.
          if (form instanceof HTMLFormElement) {
            try {
              form.reportValidity();
            } catch {
              // Some frameworks override checkValidity/reportValidity in
              // ways that can throw; a failure here must not abort the
              // rest of the check.
            }
          }
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

          const hasAlertRegionInForm = !!form.querySelector(
            '[role="alert"], [aria-live="polite"], [aria-live="assertive"]',
          );

          const fields = requiredFields.map((el, i) => {
            const afterStyle = getComputedStyle(el);
            const after = `${afterStyle.borderColor}|${afterStyle.backgroundColor}|${afterStyle.outlineColor}`;
            const visuallyChanged = after !== beforeStyles[i];

            const ariaInvalidTrue = el.getAttribute('aria-invalid') === 'true';
            const describedBy = el.getAttribute('aria-describedby');
            const hasAssociatedErrorText = describedBy
              ? describedBy.split(/\s+/).some((id) => {
                  const errEl = document.getElementById(id);
                  return !!errEl && errEl.textContent!.trim().length > 0;
                })
              : false;

            const selector = el.id
              ? `#${el.id}`
              : `${el.tagName.toLowerCase()}[name="${el.getAttribute('name') ?? ''}"]`;
            el.removeAttribute(ATTR);

            return {
              selector,
              visuallyChanged,
              ariaInvalidTrue,
              hasAssociatedErrorText,
              hasAlertRegionInForm,
            };
          });

          const formSelector = form.id ? `#${form.id}` : `form:nth-of-type(${formIndex + 1})`;
          results.push({ formSelector, fields });
        });

        return results;
      } finally {
        window.fetch = realFetch;
        XMLHttpRequest.prototype.send = realSend;
        try {
          navigator.sendBeacon = realBeacon;
        } catch {
          // Mirror of the install above: nothing to restore if it never took.
        }
      }
    });

    if (signal?.aborted) throw new Error('form-error-handling aborted');
    triggeredAnyForm = forms.length > 0;
    return { pageUrl, forms };
  } finally {
    // Wait for the blocked traffic to actually stop arriving before removing
    // the block. See layer 3 in the file-level comment for what tearing this
    // down immediately cost.
    //
    // Only when a form was actually triggered. A page where no form had an
    // empty required field never had a submit dispatched, so it has no
    // check-initiated request that could still be in flight, and making every
    // page in a scan pay this wait to protect a submission that cannot exist
    // would be a real cost (every page, on a crawl with no page cap) for no
    // safety gained.
    // The clock starts here, not at whatever the route last blocked: the
    // request this window exists to catch is one that has not been made yet.
    const settleStart = Date.now();
    const settleDeadline = settleStart + REQUEST_BLOCK_MAX_SETTLE_MS;
    while (
      triggeredAnyForm &&
      !signal?.aborted &&
      Date.now() < settleDeadline &&
      Date.now() - Math.max(lastBlockedAt, settleStart) < REQUEST_BLOCK_QUIET_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await page.unroute('**/*').catch(() => undefined);
  }
}
