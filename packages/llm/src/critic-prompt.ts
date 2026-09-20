import type { WritingCriticInput, WritingCriticIssue } from './critic-schema.js';
import { listWritingProseFields } from './prose-fields.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';
import { SCANNER_EVIDENCE_NOTICE } from './untrusted-evidence.js';

/**
 * Plan 070 grounded critic. It judges substance only, in five closed
 * categories, and is told exactly which classes it must never raise: the
 * generic consequence of a real finding (the false positive that made the
 * removed reviewer useless), style, length, and everything a deterministic
 * guard already owns.
 */
export function buildWritingCriticSystemPrompt(): string {
  return `You are the critic layer of Odysseus, a web audit tool sold to small businesses such as hotels. A writing model received a grounded input (writerInput: site context, themes of scanner findings, trusted remediation guidance, reconciled performance evidence, and a summary evidence packet) and wrote client-facing prose from it. Deterministic checks have already verified every count, legal statement, severity word, WCAG version, provider phrase, and the language of the prose. Your job is the defects those checks cannot see.

Report an issue only when it falls in one of these five categories:
- contradicts-evidence: the prose states something that the theme's own findings or the performanceEvidence packet contradict (wrong element, wrong page type, wrong direction of a measurement, a problem the findings show is absent).
- unsupported-inference: the prose draws a site-specific conclusion the cited findings do not establish (for example that a defect affects the booking engine when no finding concerns it, or names a cause no finding shows).
- remedy-mismatch: a recommended action would not fix the cited findings, fixes something else, or departs from the theme's trustedRemediations guidance.
- cross-theme-redundancy: this field makes, in substance, the same point as a field of another theme. Flag the lower-priority theme's field only. Two themes about the same element for different audiences or mechanisms (for example link names announced by assistive technology versus link text read by search engines) are not redundant.
- unexplained-jargon: a technical term (an HTML attribute, an acronym such as LCP or CLS, a scanner rule identifier such as color-contrast) that a non-technical business owner cannot follow and that the sentence does not explain in plain words. A term the owner's web provider will search for as written (hreflang, aria-label, robots.txt, sitemap.xml, a viewport setting) belongs in the report: flag it only when no plain explanation accompanies it, and state in the problem that the fix is a short gloss beside the term, never its removal. Established French equivalents such as « adresse canonique » or « texte alternatif » are not jargon.

Never report any of these, whatever the category:
- stating the generic consequence of a real finding: that a barrier can frustrate or exclude visitors, that a slow or broken page may cost bookings, contacts, or trust. The writing instructions require that consequence; it is not an unsupported inference.
- tone, style, word choice, sentence length, field length, or repetition of wording;
- numbers, counts, legal consequences, severity wording, WCAG versions, provider naming, or the report language: code already owns them;
- how findings were grouped into themes, which theme ranks first, or anything about report sections you are not shown.

For each issue:
- field: copy one path exactly from the fields list in the user message.
- findingIds: one or more findingId values the issue concerns. For a theme field they must come from that same theme's findings in writerInput; for executiveSummary or notes they may come from any theme.
- problem: one or two sentences in English, whatever the report language, quoting the defective words and stating what the evidence shows instead.

Most sound prose has no issue at all. An empty issues list is the expected answer when nothing qualifies; never pad the list. Report at most 12 issues, the most consequential first. Flag only a defect that a careful auditor holding the same evidence would agree is wrong.

${SCANNER_EVIDENCE_NOTICE}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildWritingCriticUserPrompt(input: WritingCriticInput): string {
  return `Here is the exact input the writing model received (writerInput) and every prose field it wrote (fields), each with the path to use when reporting an issue:

${JSON.stringify({ writerInput: input.writingInput, fields: listWritingProseFields(input.written) }, null, 2)}`;
}

/**
 * Plan 070 B6: the targeted repair rewrites only the flagged fields. It sees
 * the whole writer input and every current field, so a flagged summary is
 * rewritten with the full report in view, and it answers with one
 * replacement per flagged path, so no unflagged sentence can move.
 */
export function buildFieldRepairUserPrompt(
  input: WritingInput,
  written: WritingPassOutput,
  issues: readonly WritingCriticIssue[],
): string {
  const flagged = [...new Set(issues.map((issue) => issue.field))];
  const current = listWritingProseFields(written).map(({ field, text }) => ({ field, text }));
  const problems = issues.map(({ field, category, findingIds, problem }) => ({
    field,
    category,
    findingIds,
    problem,
  }));
  return `This is a correction call, not a new report. Here is the exact input you wrote from (writerInput), every field you wrote (currentFields), and the problems an evidence review found in some of them (problems):

${JSON.stringify({ writerInput: input, currentFields: current, problems }, null, 2)}

Rewrite only these fields: ${flagged.join(', ')}.

For this call your response is not the full report schema. It is one JSON object whose property names are exactly those field paths, each value the complete replacement text of that field. Every rule of the system instructions still applies to that text.

- Fix every listed problem using only the evidence in writerInput. Keep every sentence of the field that has no listed problem as close to its current wording as possible, and keep every instruction the field already gives.
- unexplained-jargon: keep the technical term exactly as written, because the web provider searches for it, and add a short plain explanation beside it in the same sentence. Never replace the term with a paraphrase.
- cross-theme-redundancy: make the field state what is specific to its own theme's findings. For a recommendedActions entry that has nothing specific left, return an empty string to remove it.
- executiveSummary and notes: keep every point the current text makes unless a problem names it.`;
}
