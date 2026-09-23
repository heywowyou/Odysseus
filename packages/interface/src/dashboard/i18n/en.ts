import type { DashboardStrings } from './types';
import { nav } from './sections/nav';
import { tools } from './sections/tools';
import { shell } from './sections/shell';
import { common } from './sections/common';
import { audits } from './sections/audits';
import { newScan } from './sections/new-scan';
import { scanQueue } from './sections/scan-queue';
import { workState } from './sections/work-state';
import { attention } from './sections/attention';
import { progress } from './sections/progress';
import { auditDetail } from './sections/audit-detail';
import { prepareReport } from './sections/prepare-report';
import { operator } from './sections/operator';
import { prospectHub } from './sections/prospect-hub';
import { prospects } from './sections/prospects';
import { hub } from './sections/hub';
import { evidence } from './sections/evidence';
import { preview } from './sections/preview';
import { aTraiter } from './sections/a-traiter';
import { drafts } from './sections/drafts';
import { suppressions } from './sections/suppressions';
import { login } from './sections/login';
import { labels } from './sections/labels';
import { hints } from './sections/hints';
import { errorBoundary } from './sections/error-boundary';

export const en: DashboardStrings = {
  nav: nav.en,
  tools: tools.en,
  shell: shell.en,
  common: common.en,
  audits: audits.en,
  newScan: newScan.en,
  scanQueue: scanQueue.en,
  workState: workState.en,
  attention: attention.en,
  progress: progress.en,
  auditDetail: auditDetail.en,
  prepareReport: prepareReport.en,
  operator: operator.en,
  prospectHub: prospectHub.en,
  prospects: prospects.en,
  hub: hub.en,
  evidence: evidence.en,
  preview: preview.en,
  aTraiter: aTraiter.en,
  drafts: drafts.en,
  suppressions: suppressions.en,
  login: login.en,
  labels: labels.en,
  hints: hints.en,
  errorBoundary: errorBoundary.en,
};
