import type { ReportLanguage } from '@odysseus/core';
import { OUTREACH_PROHIBITED_EXAMPLES } from './guards/outreach-vocabulary-guard.js';
import { OUTREACH_TOUCH_LIMITS } from './outreach-limits.js';
import type { OutreachProseInput } from './outreach-input.js';

/**
 * Every prohibition here is stated directly, never left to be inherited from
 * the audit prompt (docs/outreach-rules.md section 5) - this is a different
 * document read by a different call, and doctrine requires the outreach
 * prompt to be self-contained. OUTREACH_TOUCH_LIMITS and
 * OUTREACH_PROHIBITED_EXAMPLES are imported rather than restated so the
 * prompt cannot drift from the guards that actually enforce these numbers
 * and examples.
 */
const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: 'Write entirely in French. Do not answer in English. Your response is checked by an automated language-compliance guard after every attempt; a response that is not in French will be rejected and you will be asked again.',
  en: 'Write entirely in English.',
};

function touchShapeInstruction(touch: 1 | 2 | 3): string {
  if (touch === 1) {
    const limits = OUTREACH_TOUCH_LIMITS[1];
    return `This is the first message in a cold outreach sequence to a hotel that has never heard from us. Write a subject line (at most ${limits.subjectMaxChars} characters) and three fields: opening, evidenceSentence, question. Together, opening + evidenceSentence + question must total ${limits.minWords} to ${limits.maxWords} words. question must end with a question mark; opening and evidenceSentence must not.`;
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
- A named salutation ("Cher <name>", "Dear <name>") - the greeting is written by code, not by you.
- A free-mail address (gmail, yahoo, hotmail, outlook, free.fr, orange.fr, laposte.net) or an email address of any kind - the reply address is added by code, not by you.
- The offer price, a currency amount, or a description of the offer itself.
- A curiosity-gap subject line ("Quick question", "Question rapide") - state plainly what the message is about instead.
- Any answer to the objection that the site predates June 2025, beyond nothing at all - that answer is not yours to give.
- Markdown formatting, HTML tags, or a URL of any kind - plain text only. The one allowed link (touch 1 only) is added by code, not typed by you.

Examples of exactly what not to write:
${examples}`;
}

export function buildOutreachSystemPrompt(input: OutreachProseInput): string {
  const ageFraming = input.touch === 2 ? `${ageFramingSection(input)}\n\n` : '';

  return `You are the outreach layer of Odysseus, a web audit tool for French small and mid-size businesses. You are drafting one message in a three-touch cold outreach sequence to ${input.businessName}, a hotel.

${touchShapeInstruction(input.touch)}

${evidenceSection(input)}

${ageFraming}${prohibitionsBlock(input.language)}

${LANGUAGE_INSTRUCTION[input.language]}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildOutreachUserPrompt(input: OutreachProseInput): string {
  return `Here is what you may use for this message:\n\n${JSON.stringify(input, null, 2)}`;
}
