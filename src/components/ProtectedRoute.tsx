import { useEffect, useState, type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type ProtectedRouteProps = {
  children: ReactElement;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, checkAuth } = useAuth();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const verifyAuth = async () => {
      await checkAuth();
      if (isMounted) {
        setIsCheckingAuth(false);
      }
    };

    void verifyAuth();

    return () => {
      isMounted = false;
    };
  }, [checkAuth]);

  if (isCheckingAuth) {
    return (
      <div className="auth-layout" aria-live="polite" aria-busy="true" role="status">
        <p className="app-sidebar-status" style={{ textAlign: "center" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: "session_expired" }} />;
  }

  return children;
}
