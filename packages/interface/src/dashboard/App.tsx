import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/shell';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { ATraiterPage } from './routes/a-traiter';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { ProspectHubListPage } from './routes/prospect-hub-list';
import { ProspectHubDetailPage } from './routes/prospect-hub-detail';
import { DirectoryPage } from './routes/directory';
import { ScanProgressPage } from './routes/scan-progress';
import { SuppressionsPage } from './routes/suppressions';
import { ToolsPage } from './routes/tools';

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
        <Route path="annuaire" element={<DirectoryPage />} />
        <Route path="prospects" element={<ProspectHubListPage />} />
        <Route path="prospects/:prospectId" element={<ProspectHubDetailPage />} />
        {/* Plan 048 consolidates the prospect workspace. Legacy outreach
            URLs remain safe redirects for bookmarks and old notes. */}
        <Route path="a-traiter" element={<ATraiterPage />} />
        <Route path="resultats" element={<Navigate to="/prospects?view=results" replace />} />
        <Route path="ne-pas-contacter" element={<SuppressionsPage />} />
        {/* Plan 040 slice 8: links to standalone claude.ai tools kept
            outside the dashboard (see routes/tools.tsx for why). */}
        <Route path="outils" element={<ToolsPage />} />
        <Route path="outreach" element={<Navigate to="/a-traiter" replace />} />
        <Route path="outreach/drafts" element={<Navigate to="/a-traiter" replace />} />
        <Route path="outreach/replies" element={<Navigate to="/a-traiter" replace />} />
        <Route
          path="outreach/outcomes"
          element={<Navigate to="/prospects?view=results" replace />}
        />
        <Route
          path="outreach/do-not-contact"
          element={<Navigate to="/ne-pas-contacter" replace />}
        />
        <Route path="*" element={<Navigate to="/a-traiter" replace />} />
      </Route>
    </Routes>
  );
}
