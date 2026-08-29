import { z } from 'zod';
import type { ProseField } from '../prose-fields.js';

const MAX_SUBJECT_CHARS = 78;
const MAX_SHORT_FIELD_CHARS = 400;
const MAX_SENTENCE_CHARS = 300;

/**
 * One closed schema per touch, not a single schema with optional fields, and
 * not represented as a JSON-schema `oneOf` in the Mistral response format
 * (see outreach-output-schema.ts). A union would make every touch's fields
 * structurally optional at the top level, which destroys the same
 * negative-space property writing-output-schema.test.ts exists to hold: the
 * point is that touch 3's schema has no field a legal claim, a link, or a
 * second observation could hide in, not that such a field is merely unset.
 *
 * `touch` is a structural discriminant matching the call that produced this
 * response - it exists only to type the assembler's input at the package
 * boundary (`outreachProseOutputSchema` below), never as the parse target of
 * a single call. `evidenceRef` is a different thing: the model's own
 * declaration of which supplied alias it wrote about, checked by
 * alias-guard.ts against what selection actually supplied. Touch 3 has
 * neither `evidenceRef` nor any evidence-shaped field at all, because it
 * carries no scan evidence (docs/outreach-rules.md section 6, touch 3 is the
 * facts block, spliced in by the assembler, never described to the model).
 */
export const outreachTouch1OutputSchema = z
  .object({
    touch: z.literal(1),
    evidenceRef: z.literal('e1'),
    subject: z.string().min(1).max(MAX_SUBJECT_CHARS),
    opening: z.string().min(1).max(MAX_SHORT_FIELD_CHARS),
    evidenceSentence: z.string().min(1).max(MAX_SHORT_FIELD_CHARS),
    question: z.string().min(1).max(MAX_SHORT_FIELD_CHARS),
  })
  .strict();

export const outreachTouch2OutputSchema = z
  .object({
    touch: z.literal(2),
    evidenceRef: z.literal('e2'),
    // z.array(...).length(2), not z.tuple: describeZodShape in
    // test-support/zod-shape.ts only classifies ZodArray of ZodString for
    // the parity test, and a tuple would silently pass a parity assertion
    // that proves nothing.
    sentences: z.array(z.string().min(1).max(MAX_SENTENCE_CHARS)).length(2),
  })
  .strict();

export const outreachTouch3OutputSchema = z
  .object({
    touch: z.literal(3),
    closing: z.string().min(1).max(MAX_SENTENCE_CHARS),
  })
  .strict();

export type OutreachTouch1Output = z.infer<typeof outreachTouch1OutputSchema>;
export type OutreachTouch2Output = z.infer<typeof outreachTouch2OutputSchema>;
export type OutreachTouch3Output = z.infer<typeof outreachTouch3OutputSchema>;

/** Used only to type the assembler's input at the package boundary. Never
 *  the parse target of a model call: outreach-client.ts parses exactly one
 *  touch's closed schema per call, keyed on the touch it was asked for. */
export const outreachProseOutputSchema = z.discriminatedUnion('touch', [
  outreachTouch1OutputSchema,
  outreachTouch2OutputSchema,
  outreachTouch3OutputSchema,
]);

export type OutreachProseOutput = z.infer<typeof outreachProseOutputSchema>;

/** The prose fields of one output, in a fixed order, for the guards - the
 *  same shape every guard in outreach/guards/ operates on regardless of
 *  which touch produced it. */
export function outreachProseFields(output: OutreachProseOutput): ProseField[] {
  switch (output.touch) {
    case 1:
      return [
        { field: 'subject', text: output.subject },
        { field: 'opening', text: output.opening },
        { field: 'evidenceSentence', text: output.evidenceSentence },
        { field: 'question', text: output.question },
      ];
    case 2:
      return output.sentences.map((text, i) => ({ field: `sentences[${i}]`, text }));
    case 3:
      return [{ field: 'closing', text: output.closing }];
  }
}
