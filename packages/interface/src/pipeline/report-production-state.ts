/**
 * Issue #376: the one server-side answer to "what is report production doing
 * for this audit right now". Both post-confirmation producers write it -
 * `regenerateWriting` (writing, then PDFs) and `makeReportReady` (an
 * optional findings/writing refresh, then PDFs) - and the preparation view
 * returns it, so every dashboard control derives from the same state instead
 * of a local loading flag, and a page refresh restores the current stage.
 *
 * In memory, like the in-flight guards it sits beside (trade-off 62): a
 * persisted "writing" state could be stranded by a server restart, while a
 * restart here simply forgets the run, exactly as the guards do. The guards
 * stay the concurrency safety net; this registry only describes.
 */

export type ReportProductionStage = 'writing' | 'pdf-generation';

export type ReportProductionState =
  | { status: 'idle' }
  | { status: ReportProductionStage; startedAt: string; updatedAt: string }
  | { status: 'completed'; finishedAt: string }
  | { status: 'failed'; stage: ReportProductionStage; message: string; finishedAt: string };

const states = new Map<string, ReportProductionState>();

export function reportProductionState(auditId: string): ReportProductionState {
  return states.get(auditId) ?? { status: 'idle' };
}

/** Enters (or advances to) an active stage, keeping the run's start time. */
export function markReportProductionStage(auditId: string, stage: ReportProductionStage): void {
  const now = new Date().toISOString();
  const current = states.get(auditId);
  const startedAt =
    current?.status === 'writing' || current?.status === 'pdf-generation' ? current.startedAt : now;
  states.set(auditId, { status: stage, startedAt, updatedAt: now });
}

export function markReportProductionCompleted(auditId: string): void {
  states.set(auditId, { status: 'completed', finishedAt: new Date().toISOString() });
}

/** Records a failure against the stage that was running when it happened. */
export function markReportProductionFailed(auditId: string, error: unknown): void {
  const current = states.get(auditId);
  const stage = current?.status === 'pdf-generation' ? 'pdf-generation' : 'writing';
  states.set(auditId, {
    status: 'failed',
    stage,
    message: error instanceof Error ? error.message : String(error),
    finishedAt: new Date().toISOString(),
  });
}

/** A refusal that produced nothing (for example identity still unconfirmed)
 *  is not a production run: it returns the audit to idle so no stale
 *  "writing" banner outlives the request. */
export function clearReportProduction(auditId: string): void {
  states.delete(auditId);
}
