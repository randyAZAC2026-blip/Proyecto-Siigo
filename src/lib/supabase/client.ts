import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no están definidas. " +
      "Las funciones que requieren backend (login, calculadora, admin) estarán deshabilitadas, " +
      "pero /natillera sigue funcionando con localStorage.",
  );
}

// Placeholder para evitar que el import de este cliente reviente la app cuando
// el usuario solo quiere usar el módulo Natillera. Cualquier operación real
// contra Supabase fallará con un error claro en el momento en que se llame.
const FALLBACK_URL = "https://placeholder.supabase.co";
const FALLBACK_KEY = "placeholder-anon-key";

export const supabase = createClient<Database>(
  supabaseUrl || FALLBACK_URL,
  supabaseAnonKey || FALLBACK_KEY,
);
