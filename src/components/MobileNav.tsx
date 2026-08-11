import { useMemo } from "react";
import { Link, NavLink } from "react-router";
import { LayoutGrid, LogIn, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/security/AuthContext";
import { canViewRouteForSession, type AppRoute } from "@/security/permissions";
import {
  allMenuNavItems,
  filterVisibleNavGroups,
  mobileFourthTabCandidates,
  navGroups,
  type NavItemConfig,
} from "@/navigation/appNavConfig";
import { NavGroupedList } from "@/components/NavLinkList";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileNavProps {
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

function pickBottomTabs(role: ReturnType<typeof useAuth>["role"]): NavItemConfig[] {
  const fixed: AppRoute[] = ["/", "/horas", "/proyectos"];
  const byRoute = new Map(allMenuNavItems.map((i) => [i.to, i]));

  const tabs: NavItemConfig[] = [];
  for (const route of fixed) {
    const item = byRoute.get(route);
    if (item && canViewRouteForSession(role, route)) tabs.push(item);
  }

  for (const route of mobileFourthTabCandidates) {
    if (tabs.length >= 4) break;
    if (tabs.some((t) => t.to === route)) continue;
    const item = byRoute.get(route);
    if (item && canViewRouteForSession(role, route)) tabs.push(item);
  }

  return tabs.slice(0, 4);
}

export default function MobileNav({ menuOpen, onMenuOpenChange }: MobileNavProps) {
  const { user, role, isAuthenticated, logout } = useAuth();

  const visibleGroups = useMemo(
    () => filterVisibleNavGroups(navGroups, (route) => canViewRouteForSession(role, route)),
    [role],
  );
  const bottomTabs = useMemo(() => pickBottomTabs(role), [role]);

  const closeMenu = () => onMenuOpenChange(false);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[210] border-t border-bdr bg-surface/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
        aria-label="Navegación principal móvil"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 px-1 pt-1">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const label = tab.shortLabel ?? tab.label;
            return (
              <li key={tab.to} className="min-w-0 flex-1">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-r8 px-1 py-2 text-[10px] font-medium transition-colors ${
                      isActive ? "text-copper" : "text-t500 hover:text-t700"
                    }`
                  }
                >
                  <Icon size={20} strokeWidth={1.75} className="shrink-0" />
                  <span className="max-w-full truncate leading-tight">{label}</span>
                </NavLink>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onMenuOpenChange(true)}
              className={`flex min-w-0 w-full flex-col items-center justify-center gap-0.5 rounded-r8 px-1 py-2 text-[10px] font-medium transition-colors ${
                menuOpen ? "text-copper" : "text-t500 hover:text-t700"
              }`}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
            >
              <Menu size={20} strokeWidth={1.75} />
              <span className="leading-tight">Menú</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={onMenuOpenChange}>
        <SheetContent
          side="left"
          className="z-[250] flex w-[min(100vw-2rem,320px)] flex-col gap-0 border-r border-bdr bg-surface p-0 sm:max-w-[320px]"
        >
          <SheetHeader className="border-b border-bdr px-4 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold text-t900">
              <LayoutGrid size={18} className="text-copper" />
              Navegación
            </SheetTitle>
            <SheetDescription className="text-[12px] text-t500">
              {isAuthenticated ? (
                <>
                  {user ?? "—"} · <span className="font-mono">{role ?? "—"}</span>
                </>
              ) : (
                "Modo invitado · solo lectura"
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-y-auto px-3 py-3">
            <NavGroupedList groups={visibleGroups} variant="drawer" onNavigate={closeMenu} />
          </div>

          <div className="border-t border-bdr px-4 py-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  logout();
                }}
                className="flex w-full items-center gap-3 rounded-r10 px-3 py-3 text-[14px] font-medium text-t600 transition-colors hover:bg-surface2"
              >
                <LogOut size={18} strokeWidth={1.75} />
                Cerrar sesión
              </button>
            ) : (
              <Link
                to="/login"
                onClick={closeMenu}
                className="flex w-full items-center gap-3 rounded-r10 px-3 py-3 text-[14px] font-medium text-copper transition-colors hover:bg-surface2"
              >
                <LogIn size={18} strokeWidth={1.75} />
                Iniciar sesión
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
