import { OUTREACH_TOUCH_LIMITS } from '../outreach-limits.js';
import type { OutreachProseOutput } from '../outreach-schema.js';

/**
 * The shape doctrine states in words (docs/outreach-rules.md section 6) and
 * outreach-limits.ts states as numbers: word count, sentence count, subject
 * length, and which touches may ask a question. Zod's own max-length bounds
 * catch a wildly overlong field, but a word or sentence count is not a
 * character bound, and "touch 1 must ask, touches 2 and 3 must not" is a
 * cross-field rule no single field's schema can express.
 *
 * Word and sentence counting are both plain heuristics - splitting on
 * whitespace and on sentence-ending punctuation - adequate for short,
 * plainly-punctuated generated prose, not a general-purpose tokenizer.
 */
export interface OutreachStructureViolation {
  field: string;
  reason: string;
  detail?: string;
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/(?<=[.!?])\s+/u).filter((sentence) => sentence.trim().length > 0).length;
}

function hasQuestion(text: string): boolean {
  return text.includes('?');
}

export function findOutreachStructureViolations(
  output: OutreachProseOutput,
): OutreachStructureViolation[] {
  const violations: OutreachStructureViolation[] = [];
  const limits = OUTREACH_TOUCH_LIMITS[output.touch];

  if (output.touch === 1) {
    if (limits.subjectMaxChars !== null && output.subject.length > limits.subjectMaxChars) {
      violations.push({ field: 'subject', reason: 'subject-too-long' });
    }

    const bodyWords = countWords(
      [output.opening, output.evidenceSentence, output.question].join(' '),
    );
    if (bodyWords < limits.minWords) {
      violations.push({ field: 'touch1-body', reason: 'too-few-words', detail: String(bodyWords) });
    }
    if (bodyWords > limits.maxWords) {
      violations.push({
        field: 'touch1-body',
        reason: 'too-many-words',
        detail: String(bodyWords),
      });
    }

    if (!hasQuestion(output.question)) {
      violations.push({ field: 'question', reason: 'missing-question' });
    }
    if (hasQuestion(output.opening)) {
      violations.push({ field: 'opening', reason: 'unexpected-question' });
    }
    if (hasQuestion(output.evidenceSentence)) {
      violations.push({ field: 'evidenceSentence', reason: 'unexpected-question' });
    }
  }

  if (output.touch === 2) {
    if (limits.sentences !== null && output.sentences.length !== limits.sentences) {
      violations.push({ field: 'sentences', reason: 'wrong-sentence-count' });
    }
    const bodyWords = countWords(output.sentences.join(' '));
    if (bodyWords > limits.maxWords) {
      violations.push({ field: 'sentences', reason: 'too-many-words', detail: String(bodyWords) });
    }
    output.sentences.forEach((sentence, index) => {
      if (hasQuestion(sentence)) {
        violations.push({ field: `sentences[${index}]`, reason: 'unexpected-question' });
      }
    });
  }

  if (output.touch === 3) {
    const sentenceCount = countSentences(output.closing);
    if (limits.sentences !== null && sentenceCount !== limits.sentences) {
      violations.push({ field: 'closing', reason: 'wrong-sentence-count' });
    }
    const bodyWords = countWords(output.closing);
    if (bodyWords > limits.maxWords) {
      violations.push({ field: 'closing', reason: 'too-many-words', detail: String(bodyWords) });
    }
    if (hasQuestion(output.closing)) {
      violations.push({ field: 'closing', reason: 'unexpected-question' });
    }
  }

  return violations;
}
