import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/security/AuthContext";
import { isSupabaseConfigured } from "@/supabase/supabaseClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { isAuthenticated, login, loginWithSupabase } = useAuth();
  const supabaseConfigured = isSupabaseConfigured();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [sbEmail, setSbEmail] = useState("");
  const [sbPassword, setSbPassword] = useState("");
  const [sbError, setSbError] = useState<string | null>(null);
  const [sbBusy, setSbBusy] = useState(false);

  const from = useMemo(() => {
    const s = (loc.state as { from?: string } | null)?.from;
    return typeof s === "string" && s.trim() ? s : "/";
  }, [loc.state]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmitLocal = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = login(username, password);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(from, { replace: true });
  };

  const onSubmitSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSbError(null);
    setSbBusy(true);
    try {
      const res = await loginWithSupabase(sbEmail, sbPassword);
      if (!res.ok) {
        setSbError(res.error);
        return;
      }
      navigate(from, { replace: true });
    } finally {
      setSbBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col gap-6 py-6">
      <div className="w-full rounded-r12 border border-bdr bg-white p-6 shadow-sh2">
        <h1 className="text-[18px] font-semibold text-t900">Iniciar sesión con Supabase</h1>
        <p className="mt-1 text-[12px] text-t500">
          Email y contraseña del usuario en Supabase Auth. El rol se obtiene de{" "}
          <span className="font-mono text-t700">app_user_profiles</span>.
        </p>

        {!supabaseConfigured ? (
          <p className="mt-4 rounded-r8 border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Supabase no está configurado. Define variables en <span className="font-mono">.env.local</span>.
          </p>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={onSubmitSupabase}>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
                Email
              </label>
              <input
                value={sbEmail}
                onChange={(e) => setSbEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                className="rounded-r8 border border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus-visible:ring-0"
                placeholder="usuario@empresa.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
                Contraseña
              </label>
              <input
                value={sbPassword}
                onChange={(e) => setSbPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
                className="rounded-r8 border border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus-visible:ring-0"
                placeholder="••••••••"
              />
            </div>

            {sbError ? (
              <div className="rounded-r8 border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#7F1D1D]">
                {sbError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={sbBusy}
              className="w-full rounded-r8 bg-[#4F46E5] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50"
            >
              {sbBusy ? "Conectando…" : "Iniciar sesión con Supabase"}
            </button>
          </form>
        )}
      </div>

      <div className="w-full rounded-r12 border border-bdr bg-white p-6 shadow-sh2">
        <h2 className="text-[15px] font-semibold text-t900">Acceso local (temporal)</h2>
        <p className="mt-1 text-[12px] text-t500">Fallback de desarrollo; no guarda la contraseña en localStorage.</p>

        <form className="mt-5 space-y-4" onSubmit={onSubmitLocal}>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
              Usuario
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="rounded-r8 border border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus-visible:ring-0"
              placeholder="usuario"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#374151]">
              Contraseña
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="rounded-r8 border border-[#C8CCDB] bg-white px-[14px] py-[10px] text-[13px] shadow-xs focus:border-[#6366F1] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] focus-visible:ring-0"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <div className="rounded-r8 border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#7F1D1D]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-r8 bg-[#0D9488] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-[#0F766E]"
          >
            Ingresar (local)
          </button>
        </form>
      </div>
    </div>
  );
}
