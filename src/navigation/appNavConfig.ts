import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileEdit,
  Clock,
  Users,
  ClipboardList,
  FolderKanban,
  UserCircle,
  CalendarDays,
  CalendarRange,
  FileText,
  Settings,
  Bell,
  ClipboardCheck,
} from "lucide-react";
import type { AppRoute } from "@/security/permissions";

export type NavItemConfig = {
  to: AppRoute;
  label: string;
  /** Etiqueta corta para barra inferior móvil */
  shortLabel?: string;
  icon: LucideIcon;
  end?: boolean;
};

export type NavGroupConfig = {
  id: string;
  /** Encabezado visual (no es ruta). */
  label: string;
  items: NavItemConfig[];
};

/**
 * Navegación principal agrupada por propósito (fuente única desktop + drawer móvil).
 * Orden y agrupación UX «Menos es más». Auditoría proyectos queda fuera del menú
 * (acceso desde Configuración).
 */
export const navGroups: NavGroupConfig[] = [
  {
    id: "atencion",
    label: "Atención",
    items: [{ to: "/", label: "Dashboard", shortLabel: "Inicio", icon: BarChart3, end: true }],
  },
  {
    id: "operacion",
    label: "Operación",
    items: [
      { to: "/proyectos", label: "Proyectos", shortLabel: "Proyectos", icon: FolderKanban },
      { to: "/horas", label: "Control de Horas", shortLabel: "Horas", icon: Clock },
    ],
  },
  {
    id: "planificacion",
    label: "Planificación",
    items: [
      { to: "/gantt", label: "Gantt Proyectos", shortLabel: "G. Proy.", icon: CalendarDays },
      { to: "/gantt-profesionales", label: "Gantt Profesionales", shortLabel: "G. Prof.", icon: CalendarDays },
      { to: "/gantt-horas", label: "Gantt Horas", shortLabel: "G. Horas", icon: CalendarRange },
      { to: "/capacidad-equipo", label: "Capacidad del Equipo", shortLabel: "Capacidad", icon: Users },
    ],
  },
  {
    id: "personas",
    label: "Personas",
    items: [
      { to: "/profesionales", label: "Profesionales", shortLabel: "Equipo", icon: UserCircle },
      { to: "/evaluacion", label: "Evaluación", shortLabel: "Eval.", icon: ClipboardCheck },
    ],
  },
  {
    id: "comercial",
    label: "Comercial y reporte",
    items: [
      { to: "/pipeline", label: "Pipeline Comercial", shortLabel: "Pipeline", icon: ClipboardList },
      { to: "/reportes", label: "Reporte Ejecutivo", shortLabel: "Reporte", icon: FileText },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    items: [
      { to: "/formularios", label: "Formularios", shortLabel: "Datos", icon: FileEdit },
      { to: "/alertas", label: "Alertas", shortLabel: "Alertas", icon: Bell },
      { to: "/configuracion", label: "Configuración", shortLabel: "Config", icon: Settings },
    ],
  },
];

/** Lista plana de ítems de menú (sin Auditoría). */
export const allMenuNavItems: NavItemConfig[] = navGroups.flatMap((g) => g.items);

/** Candidatos para la 4.ª pestaña de la barra inferior (prioridad) */
export const mobileFourthTabCandidates: AppRoute[] = [
  "/formularios",
  "/pipeline",
  "/capacidad-equipo",
  "/profesionales",
];

/** Filtra ítems por permiso y omite grupos vacíos. */
export function filterVisibleNavGroups(
  groups: NavGroupConfig[],
  canView: (route: AppRoute) => boolean,
): NavGroupConfig[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => canView(item.to)),
    }))
    .filter((g) => g.items.length > 0);
}
