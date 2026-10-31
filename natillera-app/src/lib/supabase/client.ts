import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// Cliente lazy: si las variables faltan, se crea igual con placeholders y
// las llamadas fallan explícitamente. Así el modo "express" no necesita
// tener configuradas las variables VITE_SUPABASE_*.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder",
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export function requireSupabaseEnv(): void {
  if (!url || !anonKey) {
    throw new Error(
      "Faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
        "Copia natillera-app/.env.example a .env.local y rellena los valores.",
    );
  }
}
