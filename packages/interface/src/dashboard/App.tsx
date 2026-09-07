import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/shell';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { DraftsPage } from './routes/drafts';
import { EvidencePage } from './routes/evidence';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { OutcomesPage } from './routes/outcomes';
import { OutreachThreadPage } from './routes/outreach-thread';
import { PrescanPage } from './routes/prescan';
import { PreviewPage } from './routes/preview';
import { ProspectDetailPage } from './routes/prospect-detail';
import { ProspectsPage } from './routes/prospects';
import { RepliesPage } from './routes/replies';
import { ScanProgressPage } from './routes/scan-progress';
import { ScorePage } from './routes/score';
import { SuppressionsPage } from './routes/suppressions';
import { VendorsPage } from './routes/vendors';
import { OutreachIndexPage } from './routes/outreach-index';

export function App() {
  return (
    <Routes>
      {/* Shown before authentication, so it sits outside the AppShell and
          renders without the operator navigation. */}
      <Route path="login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/audits" replace />} />
        <Route path="audits" element={<AuditsPage />} />
        <Route path="audits/:auditId" element={<AuditDetailPage />} />
        <Route path="scans/new" element={<NewScanPage />} />
        <Route path="scans/:jobId" element={<ScanProgressPage />} />
        <Route path="prospects" element={<ProspectsPage />} />
        <Route path="prospects/:candidateId" element={<ProspectDetailPage />} />
        <Route path="prospects/:candidateId/prescan" element={<PrescanPage />} />
        <Route path="prospects/:candidateId/score" element={<ScorePage />} />
        <Route path="prospects/:candidateId/evidence" element={<EvidencePage />} />
        <Route path="prospects/:candidateId/preview" element={<PreviewPage />} />
        <Route path="prospects/:candidateId/outreach" element={<OutreachThreadPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="outreach" element={<OutreachIndexPage />} />
        <Route path="outreach/drafts" element={<DraftsPage />} />
        <Route path="outreach/replies" element={<RepliesPage />} />
        <Route path="outreach/do-not-contact" element={<SuppressionsPage />} />
        <Route path="outreach/outcomes" element={<OutcomesPage />} />
        <Route path="*" element={<Navigate to="/audits" replace />} />
      </Route>
    </Routes>
  );
}
