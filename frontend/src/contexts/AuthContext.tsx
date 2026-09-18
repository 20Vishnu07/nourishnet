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

export interface SavedAccount {
  email: string;
  name: string;
  role: UserRole;
  org_name?: string | null;
  phone?: string | null;
  address?: string | null;
  language_pref?: string;
  saved_at: string;
}

const SAVED_ACCOUNTS_KEY = "nourishnet_saved_accounts";

export function getLocalSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalAccount(account: Omit<SavedAccount, "saved_at">) {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalSavedAccounts();
    const filtered = current.filter(
      (a) => a.email.toLowerCase() !== account.email.toLowerCase().trim()
    );
    const updated: SavedAccount[] = [
      {
        ...account,
        email: account.email.toLowerCase().trim(),
        saved_at: new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, 10);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }
}

export function removeLocalAccount(email: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalSavedAccounts();
    const filtered = current.filter(
      (a) => a.email.toLowerCase() !== email.toLowerCase().trim()
    );
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  appUser: AppUser | null;
  token: string | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isNewUser: boolean;
  error: string | null;
  savedAccounts: SavedAccount[];
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, role?: UserRole) => Promise<void>;
  register: (payload: RegisterPayload, autoLogin?: boolean) => Promise<TokenResponse>;
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
  removeSavedAccount: (email: string) => void;
  reloadSavedAccounts: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AppUser;
  is_new_user: boolean;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    let savedToken: string | null = null;
    let savedUser: AppUser | null = null;
    if (typeof window !== "undefined") {
      try {
        savedToken = localStorage.getItem("nourishnet_token");
        const rawUser = localStorage.getItem("nourishnet_user");
        if (savedToken && rawUser) {
          savedUser = JSON.parse(rawUser) as AppUser;
          if (savedUser?.language_pref) {
            i18n.changeLanguage(savedUser.language_pref);
          }
        }
      } catch {
        localStorage.removeItem("nourishnet_token");
        localStorage.removeItem("nourishnet_user");
      }
    }
    return {
      firebaseUser: null,
      appUser: savedUser,
      token: savedToken,
      isLoading: false,
      isInitialLoading: false,
      isNewUser: false,
      error: null,
      savedAccounts: getLocalSavedAccounts(),
    };
  });

  const reloadSavedAccounts = useCallback(() => {
    setState((prev) => ({ ...prev, savedAccounts: getLocalSavedAccounts() }));
  }, []);

  const removeSavedAccount = useCallback((email: string) => {
    removeLocalAccount(email);
    setState((prev) => ({ ...prev, savedAccounts: getLocalSavedAccounts() }));
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
    const cleanEmail = email.trim().toLowerCase();
    try {
      const response = await apiFetch<TokenResponse>("/auth/login", {
        method: "POST",
        body: {
          email: cleanEmail,
          password,
          role: role || undefined,
        },
      });

      localStorage.setItem("nourishnet_token", response.access_token);
      localStorage.setItem("nourishnet_user", JSON.stringify(response.user));

      // Always save or update registered profile locally
      saveLocalAccount({
        email: response.user.email || cleanEmail,
        name: response.user.name,
        role: response.user.role,
        org_name: response.user.org_name,
        phone: response.user.phone,
        address: response.user.address,
        language_pref: response.user.language_pref,
      });

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
        savedAccounts: getLocalSavedAccounts(),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      const lower = message.toLowerCase();

      // Transparent Self-Healing Recovery:
      // If the backend ephemeral SQLite database was reset on Render and returns 404 "No account found",
      // but this user was previously registered on this device, automatically re-register & log in!
      if (lower.includes("no account") || lower.includes("not found") || lower.includes("404")) {
        const saved = getLocalSavedAccounts().find(
          (a) => a.email.toLowerCase() === cleanEmail
        );
        if (saved) {
          try {
            const restored = await apiFetch<TokenResponse>("/auth/register", {
              method: "POST",
              body: {
                name: saved.name,
                email: saved.email,
                password,
                role: role || saved.role,
                phone: saved.phone || undefined,
                org_name: saved.org_name || undefined,
                address: saved.address || undefined,
                language_pref: saved.language_pref || "en",
              },
            });

            localStorage.setItem("nourishnet_token", restored.access_token);
            localStorage.setItem("nourishnet_user", JSON.stringify(restored.user));

            if (restored.user.language_pref) {
              i18n.changeLanguage(restored.user.language_pref);
            }

            setState((prev) => ({
              ...prev,
              token: restored.access_token,
              appUser: restored.user,
              isNewUser: false,
              isLoading: false,
              error: null,
              savedAccounts: getLocalSavedAccounts(),
            }));
            return;
          } catch {
            // If background re-registration fails, continue to report login error
          }
        }
      }

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
    const cleanEmail = payload.email.trim().toLowerCase();
    try {
      const response = await apiFetch<TokenResponse>("/auth/register", {
        method: "POST",
        body: {
          name: payload.name.trim(),
          email: cleanEmail,
          password: payload.password,
          role: payload.role,
          phone: payload.phone?.trim() || undefined,
          org_name: payload.org_name?.trim() || undefined,
          address: payload.address?.trim() || undefined,
          language_pref: payload.language_pref || i18n.language || "en",
        },
      });

      // Securely store registered account locally for permanent persistence
      saveLocalAccount({
        name: payload.name.trim(),
        email: cleanEmail,
        role: payload.role,
        phone: payload.phone?.trim() || undefined,
        org_name: payload.org_name?.trim() || undefined,
        address: payload.address?.trim() || undefined,
        language_pref: payload.language_pref || i18n.language || "en",
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
          savedAccounts: getLocalSavedAccounts(),
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
          savedAccounts: getLocalSavedAccounts(),
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
    setState((prev) => ({
      ...prev,
      firebaseUser: null,
      appUser: null,
      token: null,
      isLoading: false,
      isInitialLoading: false,
      isNewUser: false,
      error: null,
      savedAccounts: getLocalSavedAccounts(),
    }));
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
        removeSavedAccount,
        reloadSavedAccounts,
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
