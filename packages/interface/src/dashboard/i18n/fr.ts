import type { DashboardStrings } from './types';
import { nav } from './sections/nav';
import { tools } from './sections/tools';
import { shell } from './sections/shell';
import { common } from './sections/common';
import { audits } from './sections/audits';
import { newScan } from './sections/new-scan';
import { scanQueue } from './sections/scan-queue';
import { workState } from './sections/work-state';
import { progress } from './sections/progress';
import { auditDetail } from './sections/audit-detail';
import { prepareReport } from './sections/prepare-report';
import { operator } from './sections/operator';
import { prospectHub } from './sections/prospect-hub';
import { prospects } from './sections/prospects';
import { prospectDetail } from './sections/prospect-detail';
import { hub } from './sections/hub';
import { prescan } from './sections/prescan';
import { score } from './sections/score';
import { evidence } from './sections/evidence';
import { preview } from './sections/preview';
import { outreachThread } from './sections/outreach-thread';
import { aTraiter } from './sections/a-traiter';
import { drafts } from './sections/drafts';
import { suppressions } from './sections/suppressions';
import { outcomes } from './sections/outcomes';
import { login } from './sections/login';
import { labels } from './sections/labels';
import { hints } from './sections/hints';
import { errorBoundary } from './sections/error-boundary';

export const fr: DashboardStrings = {
  nav: nav.fr,
  tools: tools.fr,
  shell: shell.fr,
  common: common.fr,
  audits: audits.fr,
  newScan: newScan.fr,
  scanQueue: scanQueue.fr,
  workState: workState.fr,
  progress: progress.fr,
  auditDetail: auditDetail.fr,
  prepareReport: prepareReport.fr,
  operator: operator.fr,
  prospectHub: prospectHub.fr,
  prospects: prospects.fr,
  prospectDetail: prospectDetail.fr,
  hub: hub.fr,
  prescan: prescan.fr,
  score: score.fr,
  evidence: evidence.fr,
  preview: preview.fr,
  outreachThread: outreachThread.fr,
  aTraiter: aTraiter.fr,
  drafts: drafts.fr,
  suppressions: suppressions.fr,
  outcomes: outcomes.fr,
  login: login.fr,
  labels: labels.fr,
  hints: hints.fr,
  errorBoundary: errorBoundary.fr,
};
