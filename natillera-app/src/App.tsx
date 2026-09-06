import { useState } from "react";
import {
  PiggyBank,
  BarChart3,
  ClipboardCheck,
  Landmark,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ExtractoPage } from "@/pages/ExtractoPage";
import { RegistrarPagoPage } from "@/pages/RegistrarPagoPage";
import { ControlPagosPage } from "@/pages/ControlPagosPage";
import { EstadoCuentaPage } from "@/pages/EstadoCuentaPage";

type Vista = "local" | "dashboard" | "control" | "estado" | "extracto" | "registrar";

export function App() {
  const [vista, setVista] = useState<Vista>("dashboard");

  const nav: { key: Vista; label: string; Icon: typeof PiggyBank }[] = [
    { key: "dashboard", label: "Dashboard", Icon: BarChart3 },
    { key: "control", label: "Control pagos", Icon: CheckCircle2 },
    { key: "estado", label: "Estado cuenta", Icon: FileText },
    { key: "extracto", label: "Extracto", Icon: Landmark },
    { key: "registrar", label: "Registrar pago", Icon: ClipboardCheck },
    { key: "local", label: "Local", Icon: PiggyBank },
  ];

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-5 text-[var(--color-primary)]" />
            Natillera
          </div>
          <nav className="flex items-center gap-1 flex-wrap">
            {nav.map(({ key, label, Icon }) => (
              <Button
                key={key}
                variant={vista === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setVista(key)}
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">
        <ErrorBoundary>
          {vista === "dashboard" && <DashboardPage onVolver={() => setVista("local")} />}
          {vista === "control" && <ControlPagosPage onVolver={() => setVista("dashboard")} />}
          {vista === "estado" && <EstadoCuentaPage onVolver={() => setVista("dashboard")} />}
          {vista === "extracto" && <ExtractoPage onVolver={() => setVista("dashboard")} />}
          {vista === "registrar" && (
            <RegistrarPagoPage onVolver={() => setVista("dashboard")} />
          )}
          {vista === "local" && <NatilleraPage />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
