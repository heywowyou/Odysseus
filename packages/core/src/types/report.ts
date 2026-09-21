/** Presentation choices for a stored client report artifact.
 *
 * This is a shared persisted-contract type rather than a dashboard preference:
 * a theme names the exact PDF variant an operator previews, approves, or
 * downloads. Dark remains the canonical default for every existing caller.
 */
export type ReportTheme = 'dark' | 'light';
