import { Navigate, Route, Routes, useParams } from 'react-router';
import type { JSX } from 'react';
import { AppShell } from './app/shell';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { DraftsPage } from './routes/drafts';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { OutcomesPage } from './routes/outcomes';
import { ProspectDetailPage } from './routes/prospect-detail';
import { ProspectsPage } from './routes/prospects';
import { RepliesPage } from './routes/replies';
import { ScanProgressPage } from './routes/scan-progress';
import { SuppressionsPage } from './routes/suppressions';
import { OutreachIndexPage } from './routes/outreach-index';

/** Plan 040 slice 4: the five single-purpose prospect subpages retired
 *  into the hub. Old links and bookmarks keep working: each subpage URL
 *  lands on the same hub page whose sections absorbed it
 *  (docs/product/dashboard-ia.md, page destiny table). */
function ProspectSubpageRedirect(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  return <Navigate to={`/prospects/${candidateId ?? ''}`} replace />;
}

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
        <Route path="prospects/:candidateId/prescan" element={<ProspectSubpageRedirect />} />
        <Route path="prospects/:candidateId/score" element={<ProspectSubpageRedirect />} />
        <Route path="prospects/:candidateId/evidence" element={<ProspectSubpageRedirect />} />
        <Route path="prospects/:candidateId/preview" element={<ProspectSubpageRedirect />} />
        <Route path="prospects/:candidateId/outreach" element={<ProspectSubpageRedirect />} />
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
