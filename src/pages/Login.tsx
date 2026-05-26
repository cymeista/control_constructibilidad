import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/security/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { isAuthenticated, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const from = useMemo(() => {
    const s = (loc.state as { from?: string } | null)?.from;
    return typeof s === "string" && s.trim() ? s : "/";
  }, [loc.state]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = login(username, password);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-md items-center">
      <div className="w-full rounded-r12 border border-bdr bg-white p-6 shadow-sh2">
        <h1 className="text-[18px] font-semibold text-t900">Ingresar</h1>
        <p className="mt-1 text-[12px] text-t500">Acceso local (temporal) por usuario y contraseña.</p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
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
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

