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
  FileSearch,
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

export const primaryNavItems: NavItemConfig[] = [
  { to: "/", label: "Dashboard", shortLabel: "Inicio", icon: BarChart3, end: true },
  { to: "/horas", label: "Gestión de Horas", shortLabel: "Horas", icon: Clock },
  { to: "/capacidad-equipo", label: "Capacidad del Equipo", shortLabel: "Capacidad", icon: Users },
  { to: "/reportes", label: "Reporte Ejecutivo", shortLabel: "Reporte", icon: FileText },
  { to: "/pipeline", label: "Pipeline Comercial", shortLabel: "Pipeline", icon: ClipboardList },
  { to: "/proyectos", label: "Proyectos", shortLabel: "Proyectos", icon: FolderKanban },
  { to: "/profesionales", label: "Profesionales", shortLabel: "Equipo", icon: UserCircle },
  { to: "/gantt", label: "Gantt Proyectos", shortLabel: "G. Proy.", icon: CalendarDays },
  { to: "/gantt-profesionales", label: "Gantt Profesionales", shortLabel: "G. Prof.", icon: CalendarDays },
  { to: "/gantt-horas", label: "Gantt Horas", shortLabel: "G. Horas", icon: CalendarRange },
  { to: "/evaluacion", label: "Evaluación", shortLabel: "Eval.", icon: ClipboardCheck },
];

export const secondaryNavItems: NavItemConfig[] = [
  { to: "/formularios", label: "Formularios", shortLabel: "Datos", icon: FileEdit },
  { to: "/configuracion", label: "Configuración", shortLabel: "Config", icon: Settings },
];

/** Rutas adicionales no presentes en la barra lateral de escritorio */
export const adminNavItems: NavItemConfig[] = [
  { to: "/alertas", label: "Alertas", shortLabel: "Alertas", icon: Bell },
  { to: "/auditoria-proyectos", label: "Auditoría proyectos", shortLabel: "Auditoría", icon: FileSearch },
];

/** Candidatos para la 4.ª pestaña de la barra inferior (prioridad) */
export const mobileFourthTabCandidates: AppRoute[] = [
  "/formularios",
  "/pipeline",
  "/capacidad-equipo",
  "/profesionales",
];
