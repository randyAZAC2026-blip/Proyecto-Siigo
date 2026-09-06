import { useState } from "react";
import { PiggyBank, BarChart3, ClipboardCheck, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ExtractoPage } from "@/pages/ExtractoPage";
import { RegistrarPagoPage } from "@/pages/RegistrarPagoPage";

type Vista = "local" | "dashboard" | "extracto" | "registrar";

export function App() {
  const [vista, setVista] = useState<Vista>("dashboard");

  const nav = [
    { key: "dashboard" as Vista, label: "Dashboard", Icon: BarChart3 },
    { key: "registrar" as Vista, label: "Registrar pago", Icon: ClipboardCheck },
    { key: "extracto" as Vista, label: "Extracto", Icon: Landmark },
    { key: "local" as Vista, label: "Registro local", Icon: PiggyBank },
  ];

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[1100px] px-4 py-3 flex items-center justify-between gap-2">
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
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8">
        <ErrorBoundary>
          {vista === "local" && <NatilleraPage />}
          {vista === "dashboard" && (
            <DashboardPage onVolver={() => setVista("local")} />
          )}
          {vista === "extracto" && (
            <ExtractoPage onVolver={() => setVista("dashboard")} />
          )}
          {vista === "registrar" && (
            <RegistrarPagoPage onVolver={() => setVista("dashboard")} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
