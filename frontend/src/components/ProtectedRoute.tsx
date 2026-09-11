import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { appUser, isInitialLoading } = useAuth();

  if (isInitialLoading) {
    return null;
  }

  if (!appUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
