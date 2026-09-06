import { useState } from "react";
import { PiggyBank, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NatilleraPage } from "@/pages/NatilleraPage";
import { DashboardPage } from "@/pages/DashboardPage";

type Vista = "local" | "consolidado";

export function App() {
  const [vista, setVista] = useState<Vista>("local");

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-[1100px] px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <PiggyBank className="size-5 text-[var(--color-primary)]" />
            Natillera
          </div>
          <nav className="flex items-center gap-1">
            <Button
              variant={vista === "local" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setVista("local")}
            >
              <PiggyBank className="size-4" />
              Registro local
            </Button>
            <Button
              variant={vista === "consolidado" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setVista("consolidado")}
            >
              <BarChart3 className="size-4" />
              Dashboard (SQLite)
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8">
        <ErrorBoundary>
          {vista === "local" ? (
            <NatilleraPage />
          ) : (
            <DashboardPage onVolver={() => setVista("local")} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
