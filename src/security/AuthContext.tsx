import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { isSupabaseConfigured } from "@/supabase/supabaseClient";
import { getSupabaseClient } from "@/supabase/supabaseClient";
import { fetchAppUserProfile } from "@/supabase/supabaseUserProfile";
import { validateLocalLogin, type AppRole } from "@/security/localUsers";

import type { AuthSource } from "@/security/authTypes";

export type { AuthSource };

type AuthState = {
  authSource: AuthSource;
  user: string | null;
  role: AppRole | null;
  displayName: string | null;
  supabaseUserId: string | null;
  profileError: string | null;
};

type AuthContextValue = {
  user: string | null;
  role: AppRole | null;
  authSource: AuthSource;
  displayName: string | null;
  supabaseUserId: string | null;
  profileError: string | null;
  isAuthenticated: boolean;
  isSupabaseSession: boolean;
  login: (username: string, password: string) => { ok: true } | { ok: false; error: string };
  loginWithSupabase: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  logoutSupabase: () => Promise<void>;
};

const LS_USER = "valtica_auth_user";
const LS_ROLE = "valtica_auth_role";
const LS_SESSION = "valtica_auth_session";

const EMPTY_AUTH: AuthState = {
  authSource: null,
  user: null,
  role: null,
  displayName: null,
  supabaseUserId: null,
  profileError: null,
};

function loadLocalAuthFromStorage(): AuthState {
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
    return { ...EMPTY_AUTH };
  }
  return {
    authSource: "local",
    user,
    role,
    displayName: null,
    supabaseUserId: null,
    profileError: null,
  };
}

function persistLocalAuthToStorage(s: AuthState): void {
  if (s.authSource !== "local" || !s.user || !s.role) {
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_SESSION);
    return;
  }
  localStorage.setItem(LS_USER, s.user);
  localStorage.setItem(LS_ROLE, s.role);
  localStorage.setItem(LS_SESSION, "1");
}

function clearLocalAuthStorage(): void {
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_ROLE);
  localStorage.removeItem(LS_SESSION);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>(() => loadLocalAuthFromStorage());

  const applySupabaseUser = useCallback(async (authUserId: string, fallbackEmail?: string | null) => {
    const profileRes = await fetchAppUserProfile(authUserId);
    if (!profileRes.ok) {
      setState({
        authSource: "supabase",
        user: fallbackEmail ?? null,
        role: null,
        displayName: null,
        supabaseUserId: authUserId,
        profileError: profileRes.error,
      });
      return;
    }
    clearLocalAuthStorage();
    const p = profileRes.profile;
    setState({
      authSource: "supabase",
      user: p.email ?? fallbackEmail ?? null,
      role: p.role,
      displayName: p.display_name,
      supabaseUserId: authUserId,
      profileError: null,
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let mounted = true;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (!mounted || !session?.user) return;
      void applySupabaseUser(session.user.id, session.user.email);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        void applySupabaseUser(session.user.id, session.user.email);
        return;
      }
      setState((prev) =>
        prev.authSource === "supabase"
          ? { ...EMPTY_AUTH }
          : prev,
      );
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySupabaseUser]);

  const login = useCallback((username: string, password: string) => {
    const res = validateLocalLogin(username, password);
    if (!res.ok) return { ok: false as const, error: "Usuario o contraseña incorrectos." };

    const sb = getSupabaseClient();
    if (sb) void sb.auth.signOut();

    const next: AuthState = {
      authSource: "local",
      user: res.user,
      role: res.role,
      displayName: null,
      supabaseUserId: null,
      profileError: null,
    };
    setState(next);
    persistLocalAuthToStorage(next);
    return { ok: true as const };
  }, []);

  const loginWithSupabase = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured()) {
        return { ok: false as const, error: "Supabase no está configurado en el entorno." };
      }
      const sb = getSupabaseClient();
      if (!sb) {
        return { ok: false as const, error: "No se pudo inicializar el cliente Supabase." };
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { ok: false as const, error: error.message };
      }

      const user = data.user;
      if (!user) {
        return { ok: false as const, error: "No se recibió usuario de Supabase Auth." };
      }

      const profileRes = await fetchAppUserProfile(user.id);
      if (!profileRes.ok) {
        await sb.auth.signOut();
        return { ok: false as const, error: profileRes.error };
      }

      clearLocalAuthStorage();
      const p = profileRes.profile;
      setState({
        authSource: "supabase",
        user: p.email ?? user.email ?? email.trim(),
        role: p.role,
        displayName: p.display_name,
        supabaseUserId: user.id,
        profileError: null,
      });

      return { ok: true as const };
    },
    [],
  );

  const logout = useCallback(async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setState({ ...EMPTY_AUTH });
    clearLocalAuthStorage();
    navigate("/", { replace: true });
  }, [navigate]);

  const logoutSupabase = useCallback(async () => {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
    setState((prev) => {
      if (prev.authSource !== "supabase") return prev;
      return { ...EMPTY_AUTH };
    });
    navigate("/", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(() => {
    const isSupabaseSession = state.authSource === "supabase" && !!state.supabaseUserId;
    const isAuthenticated =
      (state.authSource === "local" && !!state.user && !!state.role) ||
      (state.authSource === "supabase" &&
        !!state.supabaseUserId &&
        !!state.role &&
        !state.profileError);

    return {
      user: state.user,
      role: state.role,
      authSource: state.authSource,
      displayName: state.displayName,
      supabaseUserId: state.supabaseUserId,
      profileError: state.profileError,
      isAuthenticated,
      isSupabaseSession,
      login,
      loginWithSupabase,
      logout,
      logoutSupabase,
    };
  }, [state, login, loginWithSupabase, logout, logoutSupabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const authStorageKeys = { LS_USER, LS_ROLE, LS_SESSION };
