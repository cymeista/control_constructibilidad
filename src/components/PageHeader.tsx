import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Menu } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "@/security/AuthContext";

interface PageHeaderProps {
  onOpenMobileMenu?: () => void;
}

export default function PageHeader({ onOpenMobileMenu }: PageHeaderProps) {
  const { isAuthenticated } = useAuth();
  const today = new Date();
  const dateStr = format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  const monthStr = format(today, "MMMM yyyy", { locale: es });

  return (
    <header className="sticky top-0 z-[200] shrink-0 border-b border-bdr/80 bg-surface/95 px-4 py-3 shadow-sh1 backdrop-blur-md sm:px-8 sm:py-4 lg:px-10">
      <div className="flex min-w-0 items-start gap-3 sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
          {onOpenMobileMenu ? (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-r8 border border-bdr bg-surface2 text-t700 transition-colors hover:bg-surface md:hidden"
              aria-label="Abrir menú de navegación"
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-[clamp(0.95rem,0.9rem+0.35vw,1.35rem)] font-semibold leading-tight tracking-tight text-t900">
              <span className="md:hidden">Constructibilidad</span>
              <span className="hidden md:inline">Constructibilidad · Control de Proyectos</span>
            </h1>
            <p className="mt-0.5 truncate font-sans text-[11px] font-normal text-t500 sm:text-[12px]">
              Ricardo Gattás
            </p>
            <p className="mt-1 hidden text-[11px] text-t400 md:block">{dateStr}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {!isAuthenticated ? (
            <Link
              to="/login"
              className="rounded-full border border-copper/40 bg-copper/10 px-2.5 py-1 text-[10px] font-semibold text-copper hover:bg-copper/15 sm:px-3 sm:py-1.5 sm:text-[11px]"
            >
              Iniciar sesión
            </Link>
          ) : null}
          <span className="max-w-[7.5rem] truncate rounded-full border border-bdr bg-surface2 px-2.5 py-1 text-[10px] font-medium text-t600 sm:max-w-none sm:px-3 sm:py-1.5 sm:text-[11px]">
            {monthStr}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bdr bg-surface2 px-2.5 py-1 text-[10px] font-semibold text-t700 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[11px]">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green shadow-[0_0_0_2px_rgba(4,120,87,0.25)] animate-blink" />
            LIVE
          </span>
        </div>
      </div>
      <p className="mt-1.5 truncate text-[10px] text-t400 md:hidden">{dateStr}</p>
    </header>
  );
}
