import type { DashboardStrings } from './types';
import { nav } from './sections/nav';
import { tools } from './sections/tools';
import { shell } from './sections/shell';
import { common } from './sections/common';
import { audits } from './sections/audits';
import { newScan } from './sections/new-scan';
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

export const en: DashboardStrings = {
  nav: nav.en,
  tools: tools.en,
  shell: shell.en,
  common: common.en,
  audits: audits.en,
  newScan: newScan.en,
  progress: progress.en,
  auditDetail: auditDetail.en,
  prepareReport: prepareReport.en,
  operator: operator.en,
  prospectHub: prospectHub.en,
  prospects: prospects.en,
  prospectDetail: prospectDetail.en,
  hub: hub.en,
  prescan: prescan.en,
  score: score.en,
  evidence: evidence.en,
  preview: preview.en,
  outreachThread: outreachThread.en,
  aTraiter: aTraiter.en,
  drafts: drafts.en,
  suppressions: suppressions.en,
  outcomes: outcomes.en,
  login: login.en,
  labels: labels.en,
  hints: hints.en,
  errorBoundary: errorBoundary.en,
};
