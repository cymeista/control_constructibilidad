import type { AppRole } from "@/security/localUsers";
import type { AuthSource } from "@/security/authTypes";

export const MSG_LOGIN_SUPABASE = "Debes iniciar sesión con Supabase.";

export type AppRoute =
  | "/"
  | "/proyectos"
  | "/profesionales"
  | "/gantt"
  | "/gantt-profesionales"
  | "/gantt-horas"
  | "/evaluacion"
  | "/horas"
  | "/capacidad-equipo"
  | "/reportes"
  | "/pipeline"
  | "/formularios"
  | "/configuracion"
  | "/auditoria-proyectos"
  | "/alertas";

/** Rutas visibles para invitado (sin sesión) y rol LECTOR interno de solo lectura. */
function guestCanViewRoute(route: AppRoute): boolean {
  return (
    route === "/" ||
    route === "/horas" ||
    route === "/capacidad-equipo" ||
    route === "/reportes" ||
    route === "/pipeline" ||
    route === "/proyectos" ||
    route === "/profesionales" ||
    route === "/gantt" ||
    route === "/gantt-profesionales" ||
    route === "/gantt-horas" ||
    route === "/evaluacion"
  );
}

/**
 * Control único de visibilidad de rutas para sesión actual (menú + RequireRole).
 * - ADMIN: acceso completo
 * - EDITOR: rutas operativas + Pipeline
 * - null (invitado): rutas públicas de solo lectura
 * - LECTOR: mismo conjunto que invitado (no hay login LECTOR; sesiones antiguas se invalidan)
 */
export function canViewRouteForSession(role: AppRole | null, route: AppRoute): boolean {
  if (role === "ADMIN") return true;
  if (role === "EDITOR") {
    return (
      route === "/" ||
      route === "/proyectos" ||
      route === "/horas" ||
      route === "/profesionales" ||
      route === "/gantt" ||
      route === "/gantt-profesionales" ||
      route === "/gantt-horas" ||
      route === "/capacidad-equipo" ||
      route === "/reportes" ||
      route === "/pipeline" ||
      route === "/evaluacion"
    );
  }
  return guestCanViewRoute(route);
}

/** Crear, editar o eliminar evaluaciones de entregables completados. */
export function canGestionarEvaluacionEntregable(role: AppRole | null): boolean {
  return role === "ADMIN";
}

/** Subir snapshot main a Supabase (fase transición: sesión Supabase + rol ADMIN en perfil). */
export function canUploadAppDataToSupabase(
  authSource: AuthSource | null,
  role: AppRole | null,
): boolean {
  return authSource === "supabase" && role === "ADMIN";
}

/** Cargar snapshot desde Supabase (usuario Supabase autenticado con perfil válido). */
export function canLoadAppDataFromSupabase(
  authSource: AuthSource | null,
  role: AppRole | null,
): boolean {
  return authSource === "supabase" && role != null;
}

/** @deprecated Preferir `canViewRouteForSession`. Mantenido para compatibilidad con chequeos `can*(role)`. */
export function canViewRoute(role: AppRole, route: AppRoute): boolean {
  return canViewRouteForSession(role, route);
}

export function canEditAvance(role: AppRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function canEditNotas(role: AppRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function canRedistribuir(role: AppRole): boolean {
  return role === "ADMIN";
}

/** Cambiar estado del proyecto (No iniciado / Activo / etc.) desde vistas operativas. */
export function canEditEstadoProyecto(role: AppRole): boolean {
  return role === "ADMIN";
}

/** Cancelar / reactivar entregable sin alterar horas ni presupuesto. */
export function canCancelarEntregable(role: AppRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function canAsignar(role: AppRole): boolean {
  return role === "ADMIN";
}

/** Alta/edición/baja de `equipo_entregable` desde Proyectos (no extiende permisos EDITOR en asignaciones). */
export function canGestionarEquipoEntregable(role: AppRole): boolean {
  return role === "ADMIN";
}

/** Crear asignación ACTIVA por encima del cupo disponible de categoría (confirmación explícita). */
export function canCrearAsignacionSobrecupo(role: AppRole): boolean {
  return role === "ADMIN";
}

export function canEliminar(role: AppRole): boolean {
  return role === "ADMIN";
}

export function canEditarEvaluacion(role: AppRole): boolean {
  return role === "ADMIN" || role === "EDITOR" ? true : false;
}

export function canAccederFormularios(role: AppRole): boolean {
  return role === "ADMIN";
}

/** Archivo de alertas operativas en Asignaciones (marcar revisada / no accionable). */
export function canMarcarAlertasOperativasRevisadas(role: AppRole): boolean {
  return role === "ADMIN";
}
