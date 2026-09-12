import { useState } from "react";
import {
  PiggyBank,
  Home,
  Users,
  BarChart3,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  Landmark,
  FileText,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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

type Vista =
  | "dashboard"
  | "socios"
  | "estado"
  | "matriz"
  | "control"
  | "mora-ahorros"
  | "prestamos"
  | "mora-intereses"
  | "liquidacion"
  | "simulador"
  | "banco"
  | "local";

interface Modulo {
  key: Vista;
  label: string;
  Icon: typeof Home;
}

interface Grupo {
  titulo: string;
  items: Modulo[];
}

const GRUPOS: Grupo[] = [
  {
    titulo: "Inicio",
    items: [{ key: "dashboard", label: "Panel", Icon: Home }],
  },
  {
    titulo: "Socios",
    items: [
      { key: "socios", label: "Socios y aportes", Icon: Users },
      { key: "estado", label: "Estado de cuenta", Icon: FileText },
    ],
  },
  {
    titulo: "Ahorros",
    items: [
      { key: "matriz", label: "Matriz de ahorros", Icon: BarChart3 },
      { key: "control", label: "Control de pagos", Icon: CheckCircle2 },
      { key: "mora-ahorros", label: "Mora ahorros", Icon: AlertTriangle },
    ],
  },
  {
    titulo: "Préstamos",
    items: [
      { key: "prestamos", label: "Préstamos", Icon: AlertTriangle },
      { key: "mora-intereses", label: "Mora intereses", Icon: AlertTriangle },
      { key: "liquidacion", label: "Liquidación", Icon: Wallet },
      { key: "simulador", label: "Simulador cierre", Icon: Wallet },
    ],
  },
  {
    titulo: "Banco",
    items: [{ key: "banco", label: "Banco", Icon: Landmark }],
  },
  {
    titulo: "Otros",
    items: [{ key: "local", label: "Local (offline)", Icon: HardDrive }],
  },
];

export function App() {
  const [vista, setVista] = useState<Vista>("dashboard");
  const [menuAbierto, setMenuAbierto] = useState(false);

  const volverPanel = () => setVista("dashboard");

  return (
    <div className="min-h-svh flex">
      {/* Sidebar */}
      <aside
        className={`${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:sticky top-0 left-0 z-20 h-svh w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] transition-transform overflow-y-auto`}
      >
        <div className="p-4 flex items-center gap-2 font-semibold text-[var(--color-text)] border-b border-[var(--color-border)]">
          <PiggyBank className="size-5 text-[var(--color-primary)]" />
          Natillera
        </div>
        <nav className="p-3 space-y-4">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] px-2 mb-1.5">
                {g.titulo}
              </div>
              <div className="space-y-0.5">
                {g.items.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setVista(key);
                      setMenuAbierto(false);
                    }}
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
      </aside>

      {/* Overlay para el sidebar en móvil */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-10 bg-black/30 lg:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-5 text-[var(--color-primary)]" />
            Natillera
          </div>
          <Button variant="outline" size="sm" onClick={() => setMenuAbierto(!menuAbierto)}>
            ☰ Menú
          </Button>
        </header>
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 sm:px-6 py-8">
          <ErrorBoundary>
            {vista === "dashboard" && (
              <DashboardPage
                onVolver={volverPanel}
                onIr={(k) => setVista(k as Vista)}
              />
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
            {vista === "local" && <NatilleraPage />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
