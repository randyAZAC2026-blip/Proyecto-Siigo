import { useState } from "react";
import { LogOut, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IngresoSocio } from "@/components/auth/IngresoSocio";
import { BarraPestanas } from "@/components/layout/BarraPestanas";
import { Iniciales, Marca } from "@/components/layout/Marca";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { SociosAportesPage } from "@/pages/SociosAportesPage";
import { MatrizAhorrosPage } from "@/pages/MatrizAhorrosPage";
import { ControlPagosPage } from "@/pages/ControlPagosPage";
import { LiquidacionPage } from "@/pages/LiquidacionPage";
import { PrestamosPage } from "@/pages/PrestamosPage";
import { MoraInteresesPage } from "@/pages/MoraInteresesPage";
import { MoraAhorrosPage } from "@/pages/MoraAhorrosPage";
import { SimuladorLiquidacionPage } from "@/pages/SimuladorLiquidacionPage";
import { BancoPage } from "@/pages/BancoPage";
import { ActividadesPage } from "@/pages/ActividadesPage";
import { EstadoCuentaPage } from "@/pages/EstadoCuentaPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { MiInicioPage } from "@/pages/socio/MiInicioPage";
import { MiLiquidacionPage } from "@/pages/socio/MiLiquidacionPage";
import { USA_SUPABASE } from "@/lib/dashboard/api";
import { SesionProvider, useSesion, type Perfil } from "@/lib/auth/useSesion";
import {
  GRUPOS_ADMIN,
  GRUPOS_SOCIO,
  MAS_ADMIN,
  PESTANAS_ADMIN,
  PESTANAS_SOCIO,
  type Vista,
} from "@/lib/navegacion";

// Con el backend local (modo express) la app sigue como antes: sin login, vista de administración.
// Con Supabase cada persona entra con cédula + PIN y ve lo que su rol permite (RLS manda).
export function App() {
  if (!USA_SUPABASE) return <Estructura perfil={null} />;
  return (
    <SesionProvider>
      <ConSesion />
    </SesionProvider>
  );
}

function ConSesion() {
  const { cargando, sesion, perfil, salir } = useSesion();
  if (cargando) {
    return (
      <div className="min-h-svh flex items-center justify-center text-sm text-[var(--color-muted)]">
        <PiggyBank className="mr-2 size-5 animate-pulse text-[var(--color-primary)]" /> Cargando…
      </div>
    );
  }
  if (!sesion) return <IngresoSocio />;
  if (!perfil || (perfil.rol === "socio" && perfil.socio_id == null)) {
    return (
      <div className="min-h-svh flex items-center justify-center px-4">
        <div className="max-w-sm space-y-4 text-center">
          <p className="text-sm text-[var(--color-text)]">
            Tu cuenta entró, pero no está ligada a ningún socio de la natillera. Pídele a la administración que revise tu acceso.
          </p>
          <Button variant="outline" onClick={salir}>
            <LogOut className="size-4" /> Salir
          </Button>
        </div>
      </div>
    );
  }
  return <Estructura perfil={perfil} onSalir={salir} />;
}

function Estructura({ perfil, onSalir }: { perfil: Perfil | null; onSalir?: () => void }) {
  const esSocio = perfil?.rol === "socio";
  const grupos = esSocio ? GRUPOS_SOCIO : GRUPOS_ADMIN;
  const inicio: Vista = esSocio ? "mi-inicio" : "dashboard";
  const [vista, setVista] = useState<Vista>(inicio);
  const ir = (v: Vista) => {
    setVista(v);
    window.scrollTo({ top: 0 });
  };
  const volverPanel = () => ir(inicio);
  const socioId = perfil?.socio_id ?? 0;

  const moduloActual = grupos.flatMap((g) => g.items).find((m) => m.key === vista);
  const grupoActual = grupos.find((g) => g.items.some((m) => m.key === vista));
  const rolTexto = perfil ? (perfil.rol === "admin" ? "Tesorería" : `Socio · C.C. ${perfil.cedula}`) : "Modo local";

  return (
    <div className="min-h-svh flex">
      {/* Menú lateral: solo en pantallas grandes. En el celular manda la barra inferior. */}
      <aside className="hidden lg:flex lg:flex-col sticky top-0 h-svh w-60 shrink-0 overflow-y-auto bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
        <div className="flex items-center gap-3 border-b border-[var(--sidebar-border)] px-5 py-5">
          <Marca />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-white">Natillera</div>
            <div className="text-[11px] text-[var(--sidebar-muted)]">{rolTexto}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 px-3 py-4" aria-label="Secciones">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sidebar-muted)]">
                {g.titulo}
              </div>
              <div className="space-y-0.5">
                {g.items.map(({ key, label, Icon }) => {
                  const activa = vista === key;
                  return (
                    <button
                      key={key}
                      onClick={() => ir(key)}
                      aria-current={activa ? "page" : undefined}
                      className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--sidebar-accent)] ${
                        activa
                          ? "bg-[var(--sidebar-active)] font-medium text-white"
                          : "text-[var(--sidebar-fg)] hover:bg-[var(--sidebar-hover)] hover:text-white"
                      }`}
                    >
                      {activa && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--sidebar-accent)]" aria-hidden />
                      )}
                      <Icon className={`size-4 ${activa ? "text-[var(--sidebar-accent)]" : "opacity-80"}`} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {perfil && (
          <div className="border-t border-[var(--sidebar-border)] p-4">
            <div className="flex items-center gap-3">
              <Iniciales nombre={perfil.nombre} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px] font-medium text-white">{perfil.nombre}</div>
                <div className="truncate text-[11px] text-[var(--sidebar-muted)]">{rolTexto}</div>
              </div>
              <button
                type="button"
                onClick={onSalir}
                aria-label="Salir"
                title="Salir"
                className="grid size-8 place-items-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Celular: barra superior oscura, a juego con el menú lateral. */}
        <header className="lg:hidden sticky top-0 z-10 flex items-center justify-between gap-3 bg-[var(--sidebar)] px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <Marca chica />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Natillera</div>
              <div className="text-[11px] text-[var(--sidebar-muted)]">{moduloActual?.label ?? rolTexto}</div>
            </div>
          </div>
          {perfil && (
            <div className="flex min-w-0 items-center gap-1">
              <Iniciales nombre={perfil.nombre} chica />
              <Button variant="ghost" size="sm" onClick={onSalir} aria-label="Salir" className="shrink-0 px-2 text-[var(--sidebar-fg)] hover:bg-white/10 hover:text-white">
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </header>
        {/* Escritorio: ruta de la sección actual. */}
        <div className="hidden lg:flex sticky top-0 z-10 h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/85 px-8 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <span>{grupoActual?.titulo ?? "Inicio"}</span>
            <span aria-hidden>/</span>
            <span className="font-medium text-[var(--color-text)]">{moduloActual?.label ?? "Panel"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span className={`size-1.5 rounded-full ${USA_SUPABASE ? "bg-[var(--status-good)]" : "bg-[var(--color-warning)]"}`} aria-hidden />
            {USA_SUPABASE ? "Conectado a la nube" : "Modo local"}
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 lg:pb-10">
          <ErrorBoundary>
            {/* Vistas del socio */}
            {esSocio && vista === "mi-inicio" && (
              <MiInicioPage socioId={socioId} nombre={perfil.nombre} onIr={(k) => ir(k)} />
            )}
            {esSocio && vista === "mis-ahorros" && <EstadoCuentaPage socioFijo={socioId} />}
            {esSocio && vista === "mis-prestamos" && <PrestamosPage modoSocio />}
            {esSocio && vista === "mi-liquidacion" && <MiLiquidacionPage socioId={socioId} />}

            {/* Vistas de administración */}
            {!esSocio && (
              <>
                {vista === "dashboard" && (
                  <DashboardPage onVolver={volverPanel} onIr={(k) => ir(k as Vista)} nombre={perfil?.nombre} />
                )}
                {vista === "socios" && <SociosAportesPage onVolver={volverPanel} />}
                {vista === "estado" && <EstadoCuentaPage onVolver={volverPanel} />}
                {vista === "matriz" && <MatrizAhorrosPage onVolver={volverPanel} />}
                {vista === "control" && <ControlPagosPage onVolver={volverPanel} />}
                {vista === "mora-ahorros" && <MoraAhorrosPage onVolver={volverPanel} />}
                {vista === "prestamos" && <PrestamosPage onVolver={volverPanel} />}
                {vista === "mora-intereses" && <MoraInteresesPage onVolver={volverPanel} />}
                {vista === "liquidacion" && <LiquidacionPage onVolver={volverPanel} />}
                {vista === "simulador" && <SimuladorLiquidacionPage onVolver={volverPanel} />}
                {vista === "banco" && <BancoPage onVolver={volverPanel} />}
                {vista === "actividades" && <ActividadesPage onVolver={volverPanel} />}
                {vista === "local" && <NatilleraPage />}
              </>
            )}
          </ErrorBoundary>
        </main>
      </div>

      <BarraPestanas
        pestanas={esSocio ? PESTANAS_SOCIO : PESTANAS_ADMIN}
        mas={esSocio ? [] : MAS_ADMIN}
        vista={vista}
        onIr={ir}
        onSalir={onSalir}
      />
    </div>
  );
}
