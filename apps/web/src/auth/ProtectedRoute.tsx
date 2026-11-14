import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth.js";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.loading) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        Checking session…
      </div>
    );
  }

  // local_dev mode always has a user; session mode requires login.
  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
