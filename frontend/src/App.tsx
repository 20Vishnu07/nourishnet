import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { warmUpBackend } from "./config/api";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import ProtectedRoute from "./components/ProtectedRoute";

function AppRoutes() {
  const { appUser } = useAuth();

  // Pre-warm backend immediately on load and keep alive every 4 minutes
  useEffect(() => {
    warmUpBackend();
    const interval = setInterval(warmUpBackend, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/login"
        element={appUser ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
