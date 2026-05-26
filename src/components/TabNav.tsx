import { LogIn, LogOut } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { useAuth } from "@/security/AuthContext";
import { canViewRouteForSession } from "@/security/permissions";
import { primaryNavItems, secondaryNavItems } from "@/navigation/appNavConfig";
import NavLinkList from "@/components/NavLinkList";

/**
 * Navegación principal: barra lateral oscura (tablet y escritorio, md+).
 */
export default function TabNav() {
  const { user, role, isAuthenticated, logout } = useAuth();

  const visiblePrimary = useMemo(
    () => primaryNavItems.filter((t) => canViewRouteForSession(role, t.to)),
    [role],
  );
  const visibleSecondary = useMemo(
    () => secondaryNavItems.filter((t) => canViewRouteForSession(role, t.to)),
    [role],
  );

  return (
    <aside className="z-[190] hidden h-[100dvh] w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-app-sidebar md:flex lg:w-[260px]">
      <div className="border-b border-white/[0.08] px-4 py-5">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          Navegación
        </p>
        <p className="mt-1 font-sans text-[13px] font-semibold leading-snug text-white/95">
          Menú principal
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        <NavLinkList items={visiblePrimary} variant="sidebar" />
      </nav>
      <div className="border-t border-white/[0.08] px-2 py-3">
        <NavLinkList items={visibleSecondary} variant="sidebar" />
      </div>
      <div className="mt-auto border-t border-white/[0.08] px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/35">Sesión</p>
        {isAuthenticated ? (
          <>
            <p className="mt-1 text-[11px] text-white/70">
              {user ?? "—"} <span className="text-white/40">·</span>{" "}
              <span className="font-mono text-white/60">{role ?? "—"}</span>
            </p>
            <button
              type="button"
              onClick={logout}
              title="Cerrar sesión"
              className="mt-2 flex w-full items-center gap-3 rounded-r8 px-3 py-2.5 text-[13px] font-medium text-white/60 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white/90"
            >
              <LogOut size={18} strokeWidth={1.75} className="shrink-0 opacity-90" />
              <span className="leading-snug">Cerrar sesión</span>
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="mt-2 flex w-full items-center gap-3 rounded-r8 px-3 py-2.5 text-[13px] font-medium text-white/80 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
          >
            <LogIn size={18} strokeWidth={1.75} className="shrink-0 opacity-90" />
            <span className="leading-snug">Iniciar sesión</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
