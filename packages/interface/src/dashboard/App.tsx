import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './app/shell';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { NewScanPage } from './routes/new-scan';
import { ScanProgressPage } from './routes/scan-progress';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/audits" replace />} />
        <Route path="audits" element={<AuditsPage />} />
        <Route path="audits/:auditId" element={<AuditDetailPage />} />
        <Route path="scans/new" element={<NewScanPage />} />
        <Route path="scans/:jobId" element={<ScanProgressPage />} />
        <Route path="*" element={<Navigate to="/audits" replace />} />
      </Route>
    </Routes>
  );
}
