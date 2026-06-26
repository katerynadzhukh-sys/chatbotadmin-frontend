import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { BottomNavBar } from "./components/BottomNavBar";
import { Sidebar } from "./components/Sidebar";
import { TopAppBar } from "./components/TopAppBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { WidgetConfigPage } from "./pages/WidgetConfigPage";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-row">
      <Sidebar onLogout={logout} />
      <div className="flex-grow flex flex-col lg:pl-64 min-w-0">{children}</div>
      <BottomNavBar />
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protected app routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <TopAppBar title="Dashboard Übersicht" />
              <DashboardPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/widgets/:id"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <WidgetConfigPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statistiken"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <StatisticsPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Unknown paths fall back to the dashboard, which enforces auth. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
