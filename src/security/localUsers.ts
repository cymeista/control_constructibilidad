/**
 * Autenticación local TEMPORAL (solo frontend).
 * Esto NO es seguridad productiva real: las contraseñas están en código para esta etapa.
 * Más adelante se reemplazará por un proveedor real (p. ej. Supabase Auth).
 */

export type AppRole = "ADMIN" | "EDITOR" | "LECTOR";

export type LocalUser = {
  username: string;
  password: string;
  role: AppRole;
};

export const LOCAL_USERS: LocalUser[] = [
  { username: "ricardo", password: "admin123", role: "ADMIN" },
  { username: "editor", password: "editor123", role: "EDITOR" },
];

export function validateLocalLogin(usernameRaw: string, passwordRaw: string): { ok: true; user: string; role: AppRole } | { ok: false } {
  const username = String(usernameRaw ?? "").trim().toLowerCase();
  // Contraseña sigue siendo case-sensitive; solo recortamos espacios accidentales.
  const password = String(passwordRaw ?? "").trim();
  const hit = LOCAL_USERS.find((u) => u.username.toLowerCase() === username && u.password === password);
  if (!hit) return { ok: false };
  return { ok: true, user: hit.username, role: hit.role };
}
