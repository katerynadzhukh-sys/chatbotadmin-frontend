import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "./Icon";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional: require a specific backend role to access this route. */
  requiredRole?: string;
}

/**
 * Route guard. Redirects unauthenticated users to /login (preserving the
 * intended path in router state). Superadmins bypass the role check.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== "superadmin") {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-gutter">
        <div className="w-full max-w-sm text-center">
          <Icon name="block" className="text-error mb-4" style={{ fontSize: 40 }} />
          <h2 className="text-headline-md font-bold text-on-surface mb-2">Zugriff verweigert</h2>
          <p className="text-sm text-on-surface-variant">
            Sie benötigen die Rolle <strong>{requiredRole}</strong>, um auf diese Seite zuzugreifen.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
