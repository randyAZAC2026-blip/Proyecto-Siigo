import { useState } from "react";
import { LogOut, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IngresoSocio } from "@/components/auth/IngresoSocio";
import { BarraPestanas } from "@/components/layout/BarraPestanas";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SociosAportesPage } from "@/pages/SociosAportesPage";
import { MatrizAhorrosPage } from "@/pages/MatrizAhorrosPage";
import { ControlPagosPage } from "@/pages/ControlPagosPage";
import { LiquidacionPage } from "@/pages/LiquidacionPage";
import { PrestamosPage } from "@/pages/PrestamosPage";
import { MoraInteresesPage } from "@/pages/MoraInteresesPage";
import { MoraAhorrosPage } from "@/pages/MoraAhorrosPage";
import { SimuladorLiquidacionPage } from "@/pages/SimuladorLiquidacionPage";
import { BancoPage } from "@/pages/BancoPage";
import { EstadoCuentaPage } from "@/pages/EstadoCuentaPage";
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

  return (
    <div className="min-h-svh flex">
      {/* Menú lateral: solo en pantallas grandes. En el celular manda la barra inferior. */}
      <aside className="hidden lg:flex lg:flex-col sticky top-0 h-svh w-56 shrink-0 bg-[var(--color-surface)] border-r border-[var(--color-border)] overflow-y-auto">
        <div className="p-4 flex items-center gap-2 font-semibold text-[var(--color-text)] border-b border-[var(--color-border)]">
          <PiggyBank className="size-5 text-[var(--color-primary)]" />
          Natillera
        </div>
        <nav className="p-3 space-y-4 flex-1">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] px-2 mb-1.5">
                {g.titulo}
              </div>
              <div className="space-y-0.5">
                {g.items.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => ir(key)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      vista === key
                        ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
                        : "text-[var(--color-text)] hover:bg-[var(--color-primary)]/5"
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        {perfil && (
          <div className="border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)]">
            <div className="truncate font-medium text-[var(--color-text)]">{perfil.nombre}</div>
            <div className="mb-2">{perfil.rol === "admin" ? "Administración" : `Socio · C.C. ${perfil.cedula}`}</div>
            <Button variant="outline" size="sm" className="w-full" onClick={onSalir}>
              <LogOut className="size-4" /> Salir
            </Button>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-5 text-[var(--color-primary)]" />
            Natillera
          </div>
          {perfil && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs text-[var(--color-muted)]">{perfil.nombre}</span>
              <Button variant="ghost" size="sm" onClick={onSalir} aria-label="Salir" className="shrink-0 px-2">
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-8">
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
                {vista === "dashboard" && <DashboardPage onVolver={volverPanel} onIr={(k) => ir(k as Vista)} />}
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
