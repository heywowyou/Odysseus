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
 *    was user-triggered once it is running. So every network request is
 *    blocked (page.route('**\/*', route => route.abort())) for the exact
 *    window this check triggers and inspects validation, then unrouted
 *    immediately after. This is the actual safety net: even a form that
 *    would otherwise submit unconditionally cannot reach the network
 *    with the empty-required-field state this check intentionally
 *    creates.
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

export async function checkFormErrorHandling(page: Page, pageUrl: string): Promise<FormErrorHandlingExtraction> {
  await page.route('**/*', (route) => route.abort());
  try {
    const forms = await page.evaluate(() => {
      const ATTR = 'data-odysseus-field-id';

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
        const requiredFields = Array.from(form.querySelectorAll('[required], [aria-required="true"]')).filter(
          (el) => {
            const rect = el.getBoundingClientRect();
            const visible =
              rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
            if (!visible || el.hasAttribute('disabled')) return false;
            if (el instanceof HTMLSelectElement) return el.value === '';
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim() === '';
            return false;
          },
        );
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

        const hasAlertRegionInForm = !!form.querySelector('[role="alert"], [aria-live="polite"], [aria-live="assertive"]');

        const fields = requiredFields.map((el, i) => {
          const afterStyle = getComputedStyle(el);
          const after = `${afterStyle.borderColor}|${afterStyle.backgroundColor}|${afterStyle.outlineColor}`;
          const visuallyChanged = after !== beforeStyles[i];

          const ariaInvalidTrue = el.getAttribute('aria-invalid') === 'true';
          const describedBy = el.getAttribute('aria-describedby');
          const hasAssociatedErrorText = describedBy
            ? describedBy
                .split(/\s+/)
                .some((id) => {
                  const errEl = document.getElementById(id);
                  return !!errEl && errEl.textContent!.trim().length > 0;
                })
            : false;

          const selector = el.id
            ? `#${el.id}`
            : `${el.tagName.toLowerCase()}[name="${el.getAttribute('name') ?? ''}"]`;
          el.removeAttribute(ATTR);

          return { selector, visuallyChanged, ariaInvalidTrue, hasAssociatedErrorText, hasAlertRegionInForm };
        });

        const formSelector = form.id ? `#${form.id}` : `form:nth-of-type(${formIndex + 1})`;
        results.push({ formSelector, fields });
      });

      return results;
    });

    return { pageUrl, forms };
  } finally {
    await page.unroute('**/*');
  }
}
