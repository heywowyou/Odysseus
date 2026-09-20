/**
 * Plan 072: addressing one writing-pass prose field by path, and rewriting it.
 *
 * The critic's targeted repair and the operator's override file are the same
 * operation with a different author: take replacement texts addressed by the
 * `themes[i](themeKey).field` paths `listWritingProseFields` hands out, splice
 * them into a `WritingPassOutput` leaving every untouched field's identity
 * alone, re-sanitize, and re-run the guard table. This module is that shared
 * half. Who wrote the replacement, and what is allowed to refuse it, stays
 * with each caller.
 */

import type { WritingSanitizationWarning } from '@odysseus/core';
import { listWritingProseFields } from './prose-fields.js';
import {
  MIN_RECOMMENDED_ACTIONS,
  type WritingPassOutput,
  type WritingTheme,
} from './writing-schema.js';

type ParsedField =
  | { kind: 'summary' }
  | { kind: 'notes' }
  | { kind: 'title' | 'businessImpact'; themeIndex: number; themeKey: string }
  | { kind: 'action'; themeIndex: number; themeKey: string; actionIndex: number };

const THEME_FIELD_PATH =
  /^themes\[(\d+)\]\(([^)]+)\)\.(title|businessImpact|recommendedActions\[(\d+)\])$/u;

function parseFieldPath(field: string): ParsedField | null {
  if (field === 'executiveSummary') return { kind: 'summary' };
  if (field === 'notes') return { kind: 'notes' };
  const match = THEME_FIELD_PATH.exec(field);
  if (!match) return null;
  const themeIndex = Number(match[1]);
  const themeKey = match[2]!;
  if (match[4] !== undefined) {
    return { kind: 'action', themeIndex, themeKey, actionIndex: Number(match[4]) };
  }
  return { kind: match[3] as 'title' | 'businessImpact', themeIndex, themeKey };
}

export interface SplicedRepair {
  output: WritingPassOutput;
  /** Old action index -> new index per theme index; removed actions map to
   *  null. Only themes with a removal appear. */
  actionIndexMaps: ReadonlyMap<number, readonly (number | null)[]>;
  /** Pre-repair path -> post-repair path of every replaced field. */
  newPathByField: ReadonlyMap<string, string>;
}

/** Splices replacement texts into `base` by field path. Every other field
 *  keeps its object and string identity. Returns a reason string when the
 *  replacements cannot be applied as-is. */
export function spliceReplacements(
  base: WritingPassOutput,
  texts: ReadonlyMap<string, string>,
): SplicedRepair | string {
  let executiveSummary = base.executiveSummary;
  let notes = base.notes;
  const themeEdits = new Map<
    number,
    { title?: string; businessImpact?: string; actions: Map<number, string> }
  >();
  for (const [field, text] of texts) {
    const parsed = parseFieldPath(field);
    if (parsed === null) return `unknown field path ${field}`;
    if (parsed.kind === 'summary' || parsed.kind === 'notes') {
      if (text.trim() === '') return `empty replacement for ${field}`;
      if (parsed.kind === 'summary') executiveSummary = text;
      else notes = text;
      continue;
    }
    const theme = base.themes[parsed.themeIndex];
    if (theme === undefined || theme.themeKey !== parsed.themeKey) {
      return `stale field path ${field}`;
    }
    const edit = themeEdits.get(parsed.themeIndex) ?? { actions: new Map<number, string>() };
    themeEdits.set(parsed.themeIndex, edit);
    if (parsed.kind === 'action') {
      if (parsed.actionIndex >= theme.recommendedActions.length) return `stale field path ${field}`;
      edit.actions.set(parsed.actionIndex, text);
    } else if (text.trim() === '') {
      return `empty replacement for ${field}`;
    } else {
      edit[parsed.kind] = text;
    }
  }

  const actionIndexMaps = new Map<number, (number | null)[]>();
  const newPathByField = new Map<string, string>();
  const themes: WritingTheme[] = [];
  for (const [themeIndex, theme] of base.themes.entries()) {
    const edit = themeEdits.get(themeIndex);
    if (!edit) {
      themes.push(theme);
      continue;
    }
    const prefix = `themes[${themeIndex}](${theme.themeKey})`;
    const recommendedActions: string[] = [];
    const indexMap: (number | null)[] = [];
    for (const [actionIndex, action] of theme.recommendedActions.entries()) {
      const replacement = edit.actions.get(actionIndex);
      if (replacement !== undefined && replacement.trim() === '') {
        indexMap.push(null);
        continue;
      }
      indexMap.push(recommendedActions.length);
      if (replacement !== undefined) {
        newPathByField.set(
          `${prefix}.recommendedActions[${actionIndex}]`,
          `${prefix}.recommendedActions[${recommendedActions.length}]`,
        );
      }
      recommendedActions.push(replacement ?? action);
    }
    if (recommendedActions.length < MIN_RECOMMENDED_ACTIONS) {
      return `repair removed every recommended action of ${theme.themeKey}`;
    }
    if (indexMap.includes(null)) actionIndexMaps.set(themeIndex, indexMap);
    for (const kind of ['title', 'businessImpact'] as const) {
      if (edit[kind] !== undefined) newPathByField.set(`${prefix}.${kind}`, `${prefix}.${kind}`);
    }
    themes.push({
      ...theme,
      title: edit.title ?? theme.title,
      businessImpact: edit.businessImpact ?? theme.businessImpact,
      recommendedActions,
    });
  }
  if (texts.has('executiveSummary')) newPathByField.set('executiveSummary', 'executiveSummary');
  if (texts.has('notes')) newPathByField.set('notes', 'notes');
  return { output: { themes, executiveSummary, notes }, actionIndexMaps, newPathByField };
}

/** Moves a pre-repair warning onto the post-repair action numbering; null
 *  when its action was removed. */
export function reindexWarning(
  warning: WritingSanitizationWarning,
  actionIndexMaps: ReadonlyMap<number, readonly (number | null)[]>,
): WritingSanitizationWarning | null {
  const parsed = parseFieldPath(warning.field);
  if (parsed?.kind !== 'action') return warning;
  const indexMap = actionIndexMaps.get(parsed.themeIndex);
  if (!indexMap) return warning;
  const next = indexMap[parsed.actionIndex];
  if (next === null || next === undefined) return null;
  return {
    code: warning.code,
    field: `themes[${parsed.themeIndex}](${parsed.themeKey}).recommendedActions[${next}]`,
  };
}

/** Reads one field's text by its path. */
export function readField(output: WritingPassOutput, field: string): string | undefined {
  return listWritingProseFields(output).find((entry) => entry.field === field)?.text;
}

/** Writes texts into `output` at post-repair paths, keeping every other
 *  field's identity. */
export function writeFields(
  output: WritingPassOutput,
  texts: ReadonlyMap<string, string>,
): WritingPassOutput {
  const byTheme = new Map<number, Map<string, string>>();
  for (const [field, text] of texts) {
    const parsed = parseFieldPath(field);
    if (parsed === null || parsed.kind === 'summary' || parsed.kind === 'notes') continue;
    const edits = byTheme.get(parsed.themeIndex) ?? new Map<string, string>();
    byTheme.set(parsed.themeIndex, edits);
    edits.set(field, text);
  }
  return {
    executiveSummary: texts.get('executiveSummary') ?? output.executiveSummary,
    notes: texts.get('notes') ?? output.notes,
    themes: output.themes.map((theme, themeIndex) => {
      const edits = byTheme.get(themeIndex);
      if (!edits) return theme;
      const prefix = `themes[${themeIndex}](${theme.themeKey})`;
      return {
        ...theme,
        title: edits.get(`${prefix}.title`) ?? theme.title,
        businessImpact: edits.get(`${prefix}.businessImpact`) ?? theme.businessImpact,
        recommendedActions: theme.recommendedActions.map(
          (action, index) => edits.get(`${prefix}.recommendedActions[${index}]`) ?? action,
        ),
      };
    }),
  };
}
