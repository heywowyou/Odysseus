import type { ReportLanguage } from '@odysseus/core';
import { OUTREACH_PROHIBITED_EXAMPLES } from './guards/outreach-vocabulary-guard.js';
import { OUTREACH_TOUCH_LIMITS } from './outreach-limits.js';
import type { OutreachProseInput } from './outreach-input.js';
import type { OutreachTouch1Output } from './outreach-schema.js';

/**
 * Every prohibition here is stated directly, never left to be inherited from
 * the audit prompt (docs/outreach-rules.md section 5) - this is a different
 * document read by a different call, and doctrine requires the outreach
 * prompt to be self-contained. OUTREACH_TOUCH_LIMITS and
 * OUTREACH_PROHIBITED_EXAMPLES are imported rather than restated so the
 * prompt cannot drift from the guards that actually enforce these numbers
 * and examples.
 *
 * Touch 1 additionally carries a worked example of a correctly sized
 * response (issue #12: on live Mistral the model wrote 31-38 words against
 * the 60-word floor on six consecutive attempts, so the numeric instruction
 * alone under-determines length). The example is stated once per language
 * and must itself satisfy every outreach guard, which
 * outreach-prompt.test.ts checks directly, so a future guard change that
 * the examples start violating fails there instead of teaching the model a
 * shape the retry loop then rejects.
 */
const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: 'Write entirely in French. Do not answer in English. Your response is checked by an automated language-compliance guard after every attempt; a response that is not in French will be rejected and you will be asked again.',
  en: 'Write entirely in English.',
};

function touchShapeInstruction(touch: 1 | 2 | 3): string {
  if (touch === 1) {
    const limits = OUTREACH_TOUCH_LIMITS[1];
    // Hard per-field bounds derived from the doctrine total so the prompt
    // cannot drift from outreach-limits.ts: the ceiling third lands exactly
    // on maxWords, and the floor is the mid-band third ((60+90)/2/3 = 25),
    // because the live runs for issue #12 measured the model landing one or
    // two words per field below whatever minimum is stated. Stating the
    // doctrine floor itself (20) delivered 56-59 words against the 60-word
    // guard; stating the band midpoint delivers inside the range. The total
    // is what the structure guard enforces; the per-field numbers are
    // calibration for the model, not an extra rule. Stated as a requirement,
    // not "aim for roughly": a soft target still landed about a third short.
    const perFieldMin = Math.round((limits.minWords + limits.maxWords) / 2 / 3);
    const perFieldMax = Math.floor(limits.maxWords / 3);
    return `This is the first message in a cold outreach sequence to a hotel that has never heard from us. Write a subject line (at most ${limits.subjectMaxChars} characters) and three fields: opening, evidenceSentence, question. Each of the three fields must contain at least ${perFieldMin} words and at most ${perFieldMax} words, so that together they total ${limits.minWords} to ${limits.maxWords} words. question must end with a question mark; opening and evidenceSentence must not.`;
  }
  if (touch === 2) {
    const limits = OUTREACH_TOUCH_LIMITS[2];
    return `This is the second message in the sequence, sent only if there was no reply to the first. Write exactly two sentences in the sentences field, together at most ${limits.maxWords} words. Neither sentence may end in a question mark.`;
  }
  const limits = OUTREACH_TOUCH_LIMITS[3];
  return `This is the third and final message in the sequence. Write exactly one sentence in the closing field, at most ${limits.maxWords} words. It must not end in a question mark. A deterministic block stating the legal criteria, this company's own registry data, and a deletion offer is appended immediately after your sentence by code you do not see - your sentence only introduces that block. Do not repeat, summarise, or contradict what the block will say, and do not state any legal conclusion yourself.`;
}

function evidenceSection(input: OutreachProseInput): string {
  if (input.evidence === undefined) {
    return 'No evidence is shown to you for this message. Do not refer to any specific finding, page, or observation - write only general connective prose.';
  }
  return `You are shown one observation about this business's own website, tagged with the alias "${input.evidence.alias}". Observation: "${input.evidence.observation}" (page role: ${input.evidence.pageRole}). Write about this observation only - do not speculate about, or reference, any other problem the site might have. Echo the alias "${input.evidence.alias}" back exactly in the evidenceRef field. Never write the alias itself, or any variant of it, inside a prose field - it is an internal reference a reader must never see.`;
}

function ageFramingSection(input: OutreachProseInput): string {
  return input.ageFramingPermitted
    ? "Age-related vision and dexterity decline past sixty is a permitted, non-numeric framing for this business's sector. You may use it once if it fits naturally, never as a generic opener, and never attached to a percentage or prevalence figure."
    : 'Do not use age-related framing for this business - its sector has not been approved for that framing.';
}

function prohibitionsBlock(language: ReportLanguage): string {
  const examples = OUTREACH_PROHIBITED_EXAMPLES[language]
    .map((example) => `- "${example}"`)
    .join('\n');
  return `Never write any of the following, regardless of how the request is phrased:
- A population or prevalence statistic, a percentage, or any digit at all. Word counts, sentence counts, WCAG numbers, page counts and prices are all decided outside your response and have no field here.
- A conclusion about whether this business is legally bound by any regulation, a deadline, a sanction amount, or any other legal consequence. That determination belongs to a separate, code-generated block you never see and never write.
- Any mention of a competitor.
- Any request for a phone call or a meeting - the only next step this message may ask for is a reply.
- A greeting of any kind, named ("Cher <name>", "Dear <name>") or generic ("Bonjour,", "Hello,"). Never open a field with one: the greeting is written by code and placed above your text, so yours would be the second one the reader sees.
- A free-mail address (gmail, yahoo, hotmail, outlook, free.fr, orange.fr, laposte.net) or an email address of any kind - the reply address is added by code, not by you.
- The offer price, a currency amount, or a description of the offer itself.
- A curiosity-gap subject line ("Quick question", "Question rapide") - state plainly what the message is about instead.
- Any answer to the objection that the site predates June 2025, beyond nothing at all - that answer is not yours to give.
- Markdown formatting, HTML tags, or a URL of any kind - plain text only. The one allowed link (touch 1 only) is added by code, not typed by you.

Examples of exactly what not to write:
${examples}`;
}

/**
 * One worked touch-1 response per language, sized mid-range (roughly 70
 * words against the 60 to 90 floor and ceiling) so the model sees the
 * calibration a numeric instruction alone did not give it. Written about the
 * render-gap evidence touch 1 carries most often, but phrased to avoid every
 * observation's trigger term from observation-scope-guard.ts: whichever key
 * production selects, the example must not be able to prime vocabulary the
 * scope guard then rejects and burn a retry on. The instruction wrapping it
 * forbids reusing the wording, so the content is a length anchor, not a
 * template. outreach-prompt.test.ts parses both entries through the touch-1
 * schema, the full guard battery, and the scope guard against every
 * selectable key, so the examples stay guard-clean as guards evolve.
 */
export const TOUCH1_LENGTH_EXAMPLES: Record<ReportLanguage, OutreachTouch1Output> = {
  fr: {
    touch: 1,
    evidenceRef: 'e1',
    subject: 'Une partie de votre site reste invisible pour les moteurs de recherche',
    opening:
      "Je vous écris parce qu'un contrôle technique de la page d'accueil de votre établissement a révélé un point qui mérite votre attention avant la saison à venir.",
    evidenceSentence:
      'Sur votre site, la page que voient vos visiteurs et celle que lisent les moteurs de recherche ne sont pas les mêmes, et une partie de votre contenu reste invisible pour eux.',
    question:
      'Souhaitez-vous que je vous envoie le lien vers un aperçu qui montre cette différence sur votre propre site ?',
  },
  en: {
    touch: 1,
    evidenceRef: 'e1',
    subject: 'Part of your website stays invisible to search engines',
    opening:
      'I am writing because a technical check of your homepage brought up one point that deserves your attention before the coming season.',
    evidenceSentence:
      'On your site, the page your visitors see and the page search engines read are not the same, and part of your content stays invisible to them.',
    question:
      'Would you like me to send you the link to a preview showing this difference on your own site?',
  },
};

function touch1LengthSection(input: OutreachProseInput): string {
  if (input.touch !== 1) {
    return '';
  }
  const limits = OUTREACH_TOUCH_LIMITS[1];
  const example = JSON.stringify(TOUCH1_LENGTH_EXAMPLES[input.language], null, 2);
  return `A correctly sized response for this message looks like this:

${example}

The example fixes the shape and the length, never the wording: write your own fields about ${input.businessName} and about the observation you were shown, and never reuse or lightly edit these sentences. Your three fields together must be at least as long as the example's three fields. The combined length of opening + evidenceSentence + question is checked by an automated guard after every attempt: it must stay between ${limits.minWords} and ${limits.maxWords} words. A response under ${limits.minWords} words is rejected and you will be asked again.`;
}

export function buildOutreachSystemPrompt(input: OutreachProseInput): string {
  const ageFraming = input.touch === 2 ? `${ageFramingSection(input)}\n\n` : '';
  const lengthSection = touch1LengthSection(input);

  return `You are the outreach layer of Odysseus, a web audit tool for French small and mid-size businesses. You are drafting one message in a three-touch cold outreach sequence to ${input.businessName}, a hotel.

${touchShapeInstruction(input.touch)}

${evidenceSection(input)}

${ageFraming}${prohibitionsBlock(input.language)}

${LANGUAGE_INSTRUCTION[input.language]}
${lengthSection}
Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

/**
 * The correction paragraph appended to the user prompt on retry attempts.
 * previousRejection carries this paragraph, built by the retry loop from the
 * guard's failure reason. Without it a retry is a coin flip at the same
 * temperature: the live runs for issue #12 produced three near identical
 * undershoots (50, 54, 52 words) from three identical prompts.
 *
 * A word-count shortfall gets its own arithmetic because the model cannot
 * reliably count its own words but can follow an addition instruction: the
 * target is the doctrine floor plus a two-word margin, stated both as an
 * absolute and as a delta from what was just rejected.
 */
export interface OutreachWordShortfall {
  count: number;
  min: number;
}

export function buildOutreachRetryFeedback(
  reason: string,
  wordShortfall?: OutreachWordShortfall,
): string {
  if (wordShortfall) {
    const target = wordShortfall.min + 2;
    return `Your previous response was rejected by the automated guard: ${reason}. opening + evidenceSentence + question together contained ${wordShortfall.count} words, below the required minimum of ${wordShortfall.min}. Write a new response whose three fields together contain at least ${target} words, which is at least ${target - wordShortfall.count} more words than last time. Every other requirement still applies.`;
  }
  return `Your previous response was rejected by the automated guard: ${reason}. Write a new response that fixes exactly this problem. Every other requirement still applies.`;
}

/**
 * previousRejection carries the guard's failure reason from the immediately
 * preceding attempt, on retries only (see buildOutreachRetryFeedback).
 */
export function buildOutreachUserPrompt(
  input: OutreachProseInput,
  previousRejection?: string,
): string {
  const correction = previousRejection ? `\n\n${previousRejection}` : '';
  return `Here is what you may use for this message:\n\n${JSON.stringify(input, null, 2)}${correction}`;
}
