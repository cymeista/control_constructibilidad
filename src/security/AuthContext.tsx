import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { validateLocalLogin, type AppRole } from "@/security/localUsers";

type AuthState = {
  user: string | null;
  role: AppRole | null;
};

type AuthContextValue = {
  user: string | null;
  role: AppRole | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
};

const LS_USER = "valtica_auth_user";
const LS_ROLE = "valtica_auth_role";
const LS_SESSION = "valtica_auth_session";

function loadAuthFromStorage(): AuthState {
  const user = localStorage.getItem(LS_USER);
  const role = localStorage.getItem(LS_ROLE) as AppRole | null;
  const session = localStorage.getItem(LS_SESSION);
  const ok =
    session === "1" &&
    user &&
    role &&
    (role === "ADMIN" || role === "EDITOR");
  if (!ok) {
    if (session || user || role) {
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(LS_ROLE);
      localStorage.removeItem(LS_SESSION);
    }
    return { user: null, role: null };
  }
  return { user, role };
}

function persistAuthToStorage(s: AuthState): void {
  if (!s.user || !s.role) {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_SESSION);
    return;
  }
  localStorage.setItem(LS_USER, s.user);
  localStorage.setItem(LS_ROLE, s.role);
  localStorage.setItem(LS_SESSION, "1");
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => loadAuthFromStorage());

  const login = useCallback((username: string, password: string) => {
    const res = validateLocalLogin(username, password);
    if (!res.ok) return { ok: false as const, error: "Usuario o contraseña incorrectos." };
    const next: AuthState = { user: res.user, role: res.role };
    setState(next);
    persistAuthToStorage(next);
    return { ok: true as const };
  }, []);

  const logout = useCallback(() => {
    setState({ user: null, role: null });
    persistAuthToStorage({ user: null, role: null });
    navigate("/", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(() => {
    const isAuthenticated = !!state.user && !!state.role;
    return { user: state.user, role: state.role, isAuthenticated, login, logout };
  }, [state, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const authStorageKeys = { LS_USER, LS_ROLE, LS_SESSION };
