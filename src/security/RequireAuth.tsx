import { Navigate } from "react-router";
import { useAuth } from "@/security/AuthContext";
import { canViewRouteForSession, type AppRoute } from "@/security/permissions";

/** Layout y rutas públicas: no exige login. */
export function RequireAuth({ children }: { children: React.ReactElement }) {
  return children;
}

export function RequireRole({ route, children }: { route: AppRoute; children: React.ReactElement }) {
  const { role } = useAuth();
  if (!canViewRouteForSession(role, route)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
