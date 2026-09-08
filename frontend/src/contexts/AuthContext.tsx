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
  name: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  org_name?: string | null;
  address?: string | null;
  language_pref: string;
  firebase_uid?: string | null;
  created_at: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  org_name?: string;
  address?: string;
  language_pref?: string;
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
  login: (email: string, password: string, role?: UserRole) => Promise<void>;
  register: (payload: RegisterPayload, autoLogin?: boolean) => Promise<any>;
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

  const login = useCallback(async (email: string, password: string, role?: UserRole) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await apiFetch<TokenResponse>("/auth/login", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          password,
          role: role || undefined,
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
        isNewUser: false,
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
  }, []);

  const register = useCallback(async (payload: RegisterPayload, autoLogin: boolean = false) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await apiFetch<TokenResponse>("/auth/register", {
        method: "POST",
        body: {
          name: payload.name.trim(),
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
          role: payload.role,
          phone: payload.phone?.trim() || undefined,
          org_name: payload.org_name?.trim() || undefined,
          address: payload.address?.trim() || undefined,
          language_pref: payload.language_pref || i18n.language || "en",
        },
      });

      if (autoLogin) {
        localStorage.setItem("nourishnet_token", response.access_token);
        localStorage.setItem("nourishnet_user", JSON.stringify(response.user));

        if (response.user.language_pref) {
          i18n.changeLanguage(response.user.language_pref);
        }

        setState((prev) => ({
          ...prev,
          token: response.access_token,
          appUser: response.user,
          isNewUser: true,
          isLoading: false,
          error: null,
        }));
      } else {
        localStorage.removeItem("nourishnet_token");
        localStorage.removeItem("nourishnet_user");
        setState((prev) => ({
          ...prev,
          token: null,
          appUser: null,
          isNewUser: false,
          isLoading: false,
          error: null,
        }));
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      throw err;
    }
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
      value={{
        ...state,
        login,
        register,
        verifyAndLogin,
        updateLanguagePref,
        logout,
        clearError,
      }}
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
