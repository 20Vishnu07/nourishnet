import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { auth } from "../config/firebase";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { apiFetch } from "../config/api";

import i18n from "../i18n";

export type UserRole = "donor" | "ngo" | "volunteer";

export interface AppUser {
  id: number;
  phone: string;
  role: UserRole;
  name: string;
  language_pref: string;
  firebase_uid: string | null;
  created_at: string;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  token: string | null;
  isLoading: boolean;
  isNewUser: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  verifyAndLogin: (
    idToken: string,
    name?: string,
    role?: UserRole,
    languagePref?: string,
    phone?: string,
  ) => Promise<void>;
  updateLanguagePref: (lang: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AppUser;
  is_new_user: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    appUser: null,
    token: null,
    isLoading: true,
    isNewUser: false,
    error: null,
  });

  // Restore session from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem("nourishnet_token");
    const savedUser = localStorage.getItem("nourishnet_user");

    if (savedToken && savedUser) {
      try {
        const user = JSON.parse(savedUser) as AppUser;
        if (user.language_pref) {
          i18n.changeLanguage(user.language_pref);
        }
        setState((prev) => ({
          ...prev,
          token: savedToken,
          appUser: user,
          isLoading: false,
        }));
      } catch {
        localStorage.removeItem("nourishnet_token");
        localStorage.removeItem("nourishnet_user");
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState((prev) => ({ ...prev, firebaseUser: user }));
    });
    return unsubscribe;
  }, []);

  const verifyAndLogin = useCallback(
    async (
      idToken: string,
      name?: string,
      role?: UserRole,
      languagePref?: string,
      phone?: string,
    ) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await apiFetch<TokenResponse>("/auth/verify", {
          method: "POST",
          body: {
            id_token: idToken,
            phone: phone || undefined,
            name: name || undefined,
            role: role || undefined,
            language_pref: languagePref || "en",
          },
        });

        localStorage.setItem("nourishnet_token", response.access_token);
        localStorage.setItem("nourishnet_user", JSON.stringify(response.user));

        if (response.user.language_pref) {
          i18n.changeLanguage(response.user.language_pref);
        }

        setState((prev) => ({
          ...prev,
          token: response.access_token,
          appUser: response.user,
          isNewUser: response.is_new_user,
          isLoading: false,
          error: null,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        throw err;
      }
    },
    [],
  );

  const updateLanguagePref = useCallback(
    async (lang: string) => {
      setState((prev) => {
        if (!prev.appUser) return prev;
        const updatedUser = { ...prev.appUser, language_pref: lang };
        localStorage.setItem("nourishnet_user", JSON.stringify(updatedUser));
        return { ...prev, appUser: updatedUser };
      });

      const currentToken = localStorage.getItem("nourishnet_token");
      if (currentToken) {
        try {
          await apiFetch("/auth/me", {
            method: "PATCH",
            token: currentToken,
            body: { language_pref: lang },
          });
        } catch (err) {
          console.warn("Failed to persist language preference to backend:", err);
        }
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Firebase sign out may fail if not initialized — that's OK
    }
    localStorage.removeItem("nourishnet_token");
    localStorage.removeItem("nourishnet_user");
    setState({
      firebaseUser: null,
      appUser: null,
      token: null,
      isLoading: false,
      isNewUser: false,
      error: null,
    });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, verifyAndLogin, updateLanguagePref, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
