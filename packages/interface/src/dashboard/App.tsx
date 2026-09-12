import { Navigate, Route, Routes, useParams } from 'react-router';
import type { JSX } from 'react';
import { AppShell } from './app/shell';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { ATraiterPage } from './routes/a-traiter';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { OutcomesPage } from './routes/outcomes';
import { ProspectDetailPage } from './routes/prospect-detail';
import { ProspectsPage } from './routes/prospects';
import { ScanProgressPage } from './routes/scan-progress';
import { SuppressionsPage } from './routes/suppressions';
import { ToolsPage } from './routes/tools';

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
        {/* Plan 040 slice 6: /a-traiter is the landing page (IA nav map). */}
        <Route index element={<Navigate to="/a-traiter" replace />} />
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
        {/* Plan 040 slice 6 (page destiny table): /a-traiter absorbs the
            outreach index, the drafts queue, and the replies queue; the
            outcomes and do-not-contact pages keep their content under their
            new names. Every old outreach URL redirects so bookmarks and
            links in old notes keep working. */}
        <Route path="a-traiter" element={<ATraiterPage />} />
        <Route path="resultats" element={<OutcomesPage />} />
        <Route path="ne-pas-contacter" element={<SuppressionsPage />} />
        {/* Plan 040 slice 8: links to standalone claude.ai tools kept
            outside the dashboard (see routes/tools.tsx for why). */}
        <Route path="outils" element={<ToolsPage />} />
        <Route path="outreach" element={<Navigate to="/a-traiter" replace />} />
        <Route path="outreach/drafts" element={<Navigate to="/a-traiter" replace />} />
        <Route path="outreach/replies" element={<Navigate to="/a-traiter" replace />} />
        <Route path="outreach/outcomes" element={<Navigate to="/resultats" replace />} />
        <Route
          path="outreach/do-not-contact"
          element={<Navigate to="/ne-pas-contacter" replace />}
        />
        <Route path="*" element={<Navigate to="/audits" replace />} />
      </Route>
    </Routes>
  );
}
