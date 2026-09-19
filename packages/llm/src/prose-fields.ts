import type { WritingPassOutput } from './writing-schema.js';

/** One named piece of model-written prose. Lets a guard be written once
 *  against text rather than once per output shape - the writing pass and
 *  the outreach pass both produce guardable prose, but as differently
 *  shaped objects, and a guard should not need to know which. */
export interface ProseField {
  field: string;
  text: string;
}

/** A writing-pass prose field with the theme it belongs to. `themeKey` is
 *  null for the report-wide fields (executiveSummary, notes). */
export interface WritingProseField extends ProseField {
  themeKey: string | null;
}

/**
 * Plan 070: the exhaustive registry of writing-pass prose field paths, in
 * the same `themes[i](key).<field>` form sanitation warnings already use, so
 * a critic issue, a sanitation warning, and a residual operator warning all
 * point at a field the same way. The critic may only name a path this
 * returns for the output it reviewed.
 */
export function listWritingProseFields(output: WritingPassOutput): WritingProseField[] {
  const fields: WritingProseField[] = [
    { field: 'executiveSummary', themeKey: null, text: output.executiveSummary },
    { field: 'notes', themeKey: null, text: output.notes },
  ];
  output.themes.forEach((theme, index) => {
    const prefix = `themes[${index}](${theme.themeKey})`;
    fields.push(
      { field: `${prefix}.title`, themeKey: theme.themeKey, text: theme.title },
      { field: `${prefix}.businessImpact`, themeKey: theme.themeKey, text: theme.businessImpact },
      ...theme.recommendedActions.map((text, actionIndex) => ({
        field: `${prefix}.recommendedActions[${actionIndex}]`,
        themeKey: theme.themeKey,
        text,
      })),
    );
  });
  return fields;
}
