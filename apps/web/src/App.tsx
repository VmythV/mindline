import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { LoginPage } from './routes/LoginPage';
import { ProjectsPage } from './routes/ProjectsPage';
import { AiProvidersPage } from './routes/AiProvidersPage';
import { MapPage } from './routes/MapPage';
import { DialogProvider } from './ui/DialogProvider';

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <DialogProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <ProjectsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/p/:projectId"
          element={
            <RequireAuth>
              <MapPage />
            </RequireAuth>
          }
        />
        <Route
          path="/settings/ai"
          element={
            <RequireAuth>
              <AiProvidersPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DialogProvider>
  );
}
