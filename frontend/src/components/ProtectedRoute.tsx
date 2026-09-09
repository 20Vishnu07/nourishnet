import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { appUser, isInitialLoading } = useAuth();

  if (isInitialLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!appUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
