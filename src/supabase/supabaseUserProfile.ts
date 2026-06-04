import type { AppRole } from "@/security/localUsers";
import { getSupabaseClient } from "@/supabase/supabaseClient";

export type AppUserProfileRow = {
  email: string | null;
  display_name: string | null;
  role: AppRole;
};

const NO_PROFILE_MSG = "No existe perfil de aplicación para este usuario.";

export function mapProfileRoleToAppRole(raw: unknown): AppRole | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "ADMIN" || u === "EDITOR" || u === "LECTOR") return u;
  return null;
}

/** Perfil en public.app_user_profiles (id = auth.users.id). */
export async function fetchAppUserProfile(
  authUserId: string,
): Promise<{ ok: true; profile: AppUserProfileRow } | { ok: false; error: string }> {
  const sb = getSupabaseClient();
  if (!sb) {
    return { ok: false, error: "Supabase no configurado." };
  }

  const uid = authUserId.trim();
  if (!uid) {
    return { ok: false, error: NO_PROFILE_MSG };
  }

  const { data, error } = await sb
    .from("app_user_profiles")
    .select("email, display_name, role")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: NO_PROFILE_MSG };
  }

  const role = mapProfileRoleToAppRole(data.role);
  if (!role) {
    return {
      ok: false,
      error: "Perfil sin rol válido. Se esperaba ADMIN, EDITOR o LECTOR.",
    };
  }

  return {
    ok: true,
    profile: {
      email: data.email != null ? String(data.email).trim() || null : null,
      display_name:
        data.display_name != null ? String(data.display_name).trim() || null : null,
      role,
    },
  };
}
