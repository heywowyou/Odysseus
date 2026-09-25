import type { DashboardStrings } from './types';
import { nav } from './sections/nav';
import { tools } from './sections/tools';
import { storage } from './sections/storage';
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

export const fr: DashboardStrings = {
  nav: nav.fr,
  tools: tools.fr,
  storage: storage.fr,
  shell: shell.fr,
  common: common.fr,
  audits: audits.fr,
  newScan: newScan.fr,
  scanQueue: scanQueue.fr,
  workState: workState.fr,
  attention: attention.fr,
  progress: progress.fr,
  auditDetail: auditDetail.fr,
  prepareReport: prepareReport.fr,
  operator: operator.fr,
  prospectHub: prospectHub.fr,
  prospects: prospects.fr,
  hub: hub.fr,
  evidence: evidence.fr,
  preview: preview.fr,
  aTraiter: aTraiter.fr,
  drafts: drafts.fr,
  suppressions: suppressions.fr,
  login: login.fr,
  labels: labels.fr,
  hints: hints.fr,
  errorBoundary: errorBoundary.fr,
};
