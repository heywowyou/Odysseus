/**
 * Dashboard copy lives one section per file under `sections/`: each file
 * holds that section's interface and its French and English strings side by
 * side, French first. This file and `fr.ts` / `en.ts` only compose them, so a
 * UI change edits the one section it touches. `strings-parity.test.ts` keeps
 * both languages on the same keys.
 */
import type { NavStrings } from './sections/nav';
import type { ToolsStrings } from './sections/tools';
import type { ShellStrings } from './sections/shell';
import type { CommonStrings } from './sections/common';
import type { AuditsStrings } from './sections/audits';
import type { NewScanStrings } from './sections/new-scan';
import type { ScanQueueStrings } from './sections/scan-queue';
import type { ProgressStrings } from './sections/progress';
import type { AuditDetailStrings } from './sections/audit-detail';
import type { PrepareReportStrings } from './sections/prepare-report';
import type { OperatorStrings } from './sections/operator';
import type { ProspectHubStrings } from './sections/prospect-hub';
import type { ProspectsStrings } from './sections/prospects';
import type { ProspectDetailStrings } from './sections/prospect-detail';
import type { HubStrings } from './sections/hub';
import type { PrescanStrings } from './sections/prescan';
import type { ScoreStrings } from './sections/score';
import type { EvidenceStrings } from './sections/evidence';
import type { PreviewStrings } from './sections/preview';
import type { OutreachThreadStrings } from './sections/outreach-thread';
import type { ATraiterStrings } from './sections/a-traiter';
import type { DraftsStrings } from './sections/drafts';
import type { SuppressionsStrings } from './sections/suppressions';
import type { OutcomesStrings } from './sections/outcomes';
import type { LoginStrings } from './sections/login';
import type { LabelsStrings } from './sections/labels';
import type { HintsStrings } from './sections/hints';
import type { ErrorBoundaryStrings } from './sections/error-boundary';

export type DashboardLanguage = 'fr' | 'en';

export interface DashboardStrings {
  nav: NavStrings;
  /** Footer link and page for /outils, plan 040 slice 8. */
  tools: ToolsStrings;
  shell: ShellStrings;
  common: CommonStrings;
  audits: AuditsStrings;
  newScan: NewScanStrings;
  /** Issue #375: batch submission from Prospects and the Audits page queue. */
  scanQueue: ScanQueueStrings;
  progress: ProgressStrings;
  auditDetail: AuditDetailStrings;
  /** Plan 019: the Prepare report card. The closed vocabulary option
   *  labels are duplicated by value from @odysseus/core's copy tables
   *  because the dashboard TypeScript project reads no workspace packages;
   *  the strings-parity test keeps both languages aligned. */
  prepareReport: PrepareReportStrings;
  /** Shared operator-interface strings (plan 013): pagination, review
   *  actions, and detail-page navigation used by several pages. */
  operator: OperatorStrings;
  /** Plan 047's durable prospect hub pages. FR is the source table: every
   *  operator-facing label in the new directory, list, results, and detail
   *  routes lives here before its English counterpart is added. */
  prospectHub: ProspectHubStrings;
  prospects: ProspectsStrings;
  prospectDetail: ProspectDetailStrings;
  /** Plan 040 slice 4: the hotel hub. The pipeline strip, the one primary
   *  action, and the few strings its six sections need beyond the stage
   *  groups they reuse (prescan, score, evidence, preview, outreachThread,
   *  drafts, outcomes, labels). */
  hub: HubStrings;
  /** Stage groups the hub sections render directly. The retired
   *  single-purpose pages are gone, so only the keys those sections still
   *  read remain. */
  prescan: PrescanStrings;
  score: ScoreStrings;
  evidence: EvidenceStrings;
  /** The hub Aperçu section's status, dates, and confirmations. Publish,
   *  reissue, and the once-only link copy live in
   *  auditDetail.outreachPreview (both sections share them). */
  preview: PreviewStrings;
  /** The hub Emails section's generate actions and toasts; the thread
   *  state badge reads labels.thread. */
  outreachThread: OutreachThreadStrings;
  /** The a-traiter page, the dashboard's landing page and the operator's
   *  prospect-only inbox. */
  aTraiter: ATraiterStrings;
  /** Plan 040 slice 4: the drafts queue page retired into /a-traiter, so
   *  what remains here is the never-send note the inbox carries and the
   *  review dialog the hub's Emails section renders. */
  drafts: DraftsStrings;
  suppressions: SuppressionsStrings;
  outcomes: OutcomesStrings;
  /** Pre-authentication page: one shared password, no username. */
  login: LoginStrings;
  /** FR and EN labels for the closed store vocabularies the operator
   *  pages render. A value missing from a map falls back to the raw
   *  code (lib/vocabulary.ts). */
  labels: LabelsStrings;
  /** One-line plain-language hints of the pipeline stages, shown next to
   *  the vocabulary by InfoTip on operator pages. Each key names the stage
   *  it explains; only stages a rendered InfoTip still explains remain. */
  hints: HintsStrings;
  /** Issue #228: the recovery surface an unexpected render/lifecycle error
   *  below the shell falls back to, instead of a blank dashboard. Never
   *  shows the thrown error's own message or stack - only the plain
   *  operator-facing copy below plus the route and a generated incident id. */
  errorBoundary: ErrorBoundaryStrings;
}
