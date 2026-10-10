import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

// Cada socio entra con cédula + PIN. Por debajo es un usuario de Supabase Auth
// con correo interno <cedula>@<dominio>; lo crea scripts/natillera-migracion/crear-accesos.js.
const DOMINIO = (import.meta.env.VITE_NAT_DOMINIO_CORREO as string | undefined) || "natillera.local";

export const limpiarCedula = (v: string) => v.replace(/\D/g, "");

export interface Perfil {
  rol: "admin" | "socio";
  socio_id: number | null;
  cedula: string;
  nombre: string;
}

interface SesionCtx {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** Hay sesión pero la cédula no está ligada a ningún socio. */
  sinPerfil: boolean;
  entrar: (cedula: string, pin: string) => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<SesionCtx | null>(null);

async function leerPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("perfiles_natillera")
    .select("rol, socio_id, cedula, socios(nombre)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const socio = data.socios as { nombre?: string } | { nombre?: string }[] | null;
  const nombre = (Array.isArray(socio) ? socio[0]?.nombre : socio?.nombre) ?? "Administrador";
  return { rol: data.rol, socio_id: data.socio_id, cedula: data.cedula, nombre };
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  // Se lee el perfil antes de publicar la sesión, para no mostrar un instante "sin perfil".
  const aplicar = useCallback(async (s: Session | null) => {
    const p = s ? await leerPerfil(s.user.id).catch(() => null) : null;
    setSesion(s);
    setPerfil(p);
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      // TOKEN_REFRESHED no cambia de usuario: no hace falta recargar el perfil.
      // supabase-js pide no llamar a Supabase dentro de este callback: se difiere un tick.
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        setTimeout(() => void aplicar(s), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [aplicar]);

  const entrar = useCallback(async (cedula: string, pin: string) => {
    const c = limpiarCedula(cedula);
    const { error } = await supabase.auth.signInWithPassword({ email: `${c}@${DOMINIO}`, password: pin.trim() });
    if (error) {
      const credenciales = /invalid login credentials|invalid_credentials|invalid_grant/i.test(`${error.code ?? ""} ${error.message}`);
      throw new Error(credenciales ? "Cédula o PIN incorrectos." : `No se pudo entrar: ${error.message}`);
    }
  }, []);

  const salir = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <Ctx.Provider value={{ cargando, sesion, perfil, sinPerfil: !!sesion && !perfil, entrar, salir }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSesion(): SesionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return c;
}
